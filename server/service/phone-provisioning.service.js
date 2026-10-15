
const crypto = require('node:crypto');

const repo = require('../repository/employee.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const { reloadAsterisk } = require('../integrations/wazo/wazo.reload');
const HttpError = require('../utils/httpError');

// Local development lock only.
// Production requires a shared lock and persistent job records.
const activeJobs = new Set();

function listItems(response) {
  if (!response || !Array.isArray(response.items)) {
    throw new HttpError(
      502,
      'Unexpected Wazo collection response',
    );
  }

  if (
    typeof response.total !== 'number' ||
    response.items.length !== response.total
  ) {
    throw new HttpError(
      409,
      'Wazo returned an incomplete collection',
    );
  }

  return response.items;
}

function getUserId(value) {
  const number = Number(value);

  if (
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(number)
  ) {
    throw new HttpError(400, 'Invalid user ID');
  }

  return number;
}

function getExtension(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{2,10}$/.test(value)
  ) {
    throw new HttpError(
      400,
      'Extension must contain 2-10 digits',
    );
  }

  return value;
}

function contextAllows(context, extension) {
  const value = Number(extension);

  return Array.isArray(context.user_ranges) &&
    context.user_ranges.some((range) => {
      const start = Number(range.start);
      const end = Number(range.end);

      return Number.isInteger(start) &&
        Number.isInteger(end) &&
        value >= start &&
        value <= end;
    });
}

async function preflight(token, tenant, userId, extension) {
  const user = await repo.getUser(token, tenant, userId);

  if (user.tenant_uuid !== tenant) {
    throw new HttpError(
      403,
      'User does not belong to this tenant',
    );
  }

  if (user.enabled !== true) {
    throw new HttpError(409, 'User is disabled');
  }

  if (!Array.isArray(user.lines)) {
    throw new HttpError(
      502,
      'Wazo did not return user line associations',
    );
  }

  if (user.lines.length > 0) {
    throw new HttpError(
      409,
      'User already has a line. Existing setup must be reviewed.',
    );
  }

  const [contextResponse, extensionResponse] =
    await Promise.all([
      repo.listContexts(token, tenant),
      repo.listExtensions(token, tenant),
    ]);

  const contexts = listItems(contextResponse);
  const extensions = listItems(extensionResponse);

  const context = contexts.find((item) =>
    item.tenant_uuid === tenant &&
    item.type === 'internal' &&
    item.enabled === true &&
    contextAllows(item, extension)
  );

  if (!context) {
    throw new HttpError(
      409,
      'No enabled internal context permits this extension',
    );
  }

  const occupied = extensions.some((item) =>
    item.context === context.name &&
    String(item.exten) === extension
  );

  if (occupied) {
    throw new HttpError(
      409,
      `Extension ${extension} is already used in this context`,
    );
  }

  return { user, context };
}

function sipConfig(username, password) {
  // Wazo PJSIP option values are represented as pairs.
  return {
    name: username,

    auth_section_options: [
      ['username', username],
      ['password', password],
      ['auth_type', 'userpass'],
    ],

    aor_section_options: [
      ['max_contacts', '1'],
      ['remove_existing', 'yes'],
    ],

    endpoint_section_options: [
      ['allow', 'alaw,ulaw'],
      ['direct_media', 'no'],
      ['rtp_symmetric', 'yes'],
      ['force_rport', 'yes'],
      ['rewrite_contact', 'no'],
    ],
  };
}

async function provisionPhone(tenant, rawUserId, body) {
  validateTenant(tenant);

  const userId = getUserId(rawUserId);
  const extension = getExtension(body?.extension);

  const jobKey = `${tenant}:${userId}`;

  if (activeJobs.has(jobKey)) {
    throw new HttpError(
      409,
      'Phone provisioning is already running for this user',
    );
  }

  activeJobs.add(jobKey);

  // Only resources created by this request are tracked here.
  const created = {
    sipEndpointId: null,
    lineId: null,
    extensionId: null,
  };

  let token;
  let stage = 'preflight';

  try {
    token = await getToken();

    const { user, context } =
      await preflight(token, tenant, userId, extension);

    const username = `cc${crypto.randomBytes(6).toString('hex')}`;
    const password = crypto.randomBytes(24).toString('hex');

    stage = 'create-sip-endpoint';

    const endpoint = await repo.createSipEndpoint(
      token,
      tenant,
      sipConfig(username, password),
    );

    const endpointId = endpoint.uuid || endpoint.id;

    if (!endpointId) {
      throw new Error('SIP endpoint creation returned no identifier');
    }

    created.sipEndpointId = endpointId;

    stage = 'create-line';

    const line = await repo.createLine(
      token,
      tenant,
      context.name,
    );

    if (!line.id) {
      throw new Error('Line creation returned no identifier');
    }

    created.lineId = line.id;

    stage = 'create-extension';

    const ext = await repo.createExtension(
      token,
      tenant,
      extension,
      context.name,
    );

    if (!ext.id) {
      throw new Error('Extension creation returned no identifier');
    }

    created.extensionId = ext.id;

    stage = 'associate-endpoint';

    await repo.associateLineEndpoint(
      token,
      tenant,
      line.id,
      endpointId,
    );

    stage = 'associate-extension';

    await repo.associateLineExtension(
      token,
      tenant,
      line.id,
      ext.id,
    );

    stage = 'associate-user';

    await repo.associateUserLine(
      token,
      tenant,
      user.uuid || user.id,
      line.id,
    );

    stage = 'verify';

    const [updatedUser, updatedLine, updatedExtension] =
      await Promise.all([
        repo.getUser(token, tenant, userId),
        repo.getLine(token, tenant, line.id),
        repo.getExtension(token, tenant, ext.id),
      ]);

    const userLinked =
      Array.isArray(updatedUser.lines) &&
      updatedUser.lines.some((item) => item.id === line.id);

    const lineHasExtension =
      Array.isArray(updatedLine.extensions) &&
      updatedLine.extensions.some((item) => item.id === ext.id);

    const extensionHasLine =
      Array.isArray(updatedExtension.lines) &&
      updatedExtension.lines.some((item) => item.id === line.id);

    const endpointLinked =
      updatedLine.endpoint_sip &&
      String(
        updatedLine.endpoint_sip.uuid ||
        updatedLine.endpoint_sip.id
      ) === String(endpointId);

    if (
      !userLinked ||
      !lineHasExtension ||
      !extensionHasLine ||
      !endpointLinked
    ) {
      throw new Error(
        'Provisioning completed, but associations could not be verified',
      );
    }

    // All Wazo resources and associations have been verified.
// Apply the configuration to Asterisk in the local Docker environment.
stage = 'reload-asterisk';

const asterisk = await reloadAsterisk();

    return {
      success: true,
      message: 'Employee phone provisioned successfully',
      tenantUuid: tenant,
      asterisk,
      employee: {
        id: user.id,
        name: [user.firstname, user.lastname]
          .filter(Boolean)
          .join(' '),
      },
      phone: {
        extension,
        context: context.name,
        lineId: line.id,
        extensionId: ext.id,
        endpointId,
      },
      sipCredentials: {
        username,
        password,
        note: 'Display once. Do not log or store in browser storage.',
      },
    };
  } catch (error) {
    // Do not delete potentially associated resources automatically.
    // They may have been committed even if a request timed out.
    // A subsequent inspection will determine what should be reused
    // or safely cleaned up.
    if (stage === 'preflight' && error instanceof HttpError) {
      throw error;
    }

    console.error('[PhoneProvisioning]', {
      stage,
      tenant,
      userId,
      created,
      // No SIP credentials or raw Wazo response bodies.
    });

    const failure = new HttpError(
      409,
      'Phone provisioning was not completed or verified. ' +
      'Inspect the user and created resources before retrying.',
    );

    throw failure;
  } finally {
    activeJobs.delete(jobKey);
  }
}

module.exports = {
  provisionPhone,
};
