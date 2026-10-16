
const repo = require('../repository/phone-number.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const {
  activateDid,
} = require('../integrations/wazo/wazo.did-activation');
const HttpError = require('../utils/httpError');

const DID_PATTERN = /^9\d{7}$/;
const jobs = new Set();

function id(value, field) {
  const number = Number(value);

  if (
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(number)
  ) {
    throw new HttpError(400, `Invalid ${field}`);
  }

  return number;
}

function getCompleteItems(result, resource) {
  if (
    !Array.isArray(result?.items) ||
    !Number.isInteger(result.total) ||
    result.items.length !== result.total
  ) {
    throw new HttpError(
      502,
      `Cannot verify complete Wazo ${resource} list`
    );
  }

  return result.items;
}

function checkTenant(item, tenant, resource) {
  if (!item || item.tenant_uuid !== tenant) {
    throw new HttpError(
      404,
      `${resource} not found in this tenant`
    );
  }

  return item;
}

function formatIncall(incall) {
  return {
    id: incall.id,
    tenantUuid: incall.tenant_uuid,
    description: incall.description,
    destination: incall.destination,
    extensions: incall.extensions || [],
  };
}

function getExtensions(incall) {
  return Array.isArray(incall.extensions)
    ? incall.extensions
    : [];
}

function associated(incall, extension) {
  return getExtensions(incall).some(
    (item) => Number(item.id) === Number(extension.id)
  );
}

async function getIncomingContext(token, tenant) {
  const contexts = getCompleteItems(
    await repo.listContexts(token, tenant),
    'contexts'
  );

  const matching = contexts.filter(
    (context) =>
      context.tenant_uuid === tenant &&
      context.type === 'incall' &&
      context.enabled === true
  );

  if (matching.length !== 1) {
    throw new HttpError(
      409,
      'Exactly one enabled incoming context is required'
    );
  }

  return matching[0];
}

async function loadState(token, tenant) {
  const context = await getIncomingContext(token, tenant);

  const extensions = getCompleteItems(
    await repo.listExtensions(token, tenant),
    'extensions'
  );

  const incalls = getCompleteItems(
    await repo.listIncalls(token, tenant),
    'incalls'
  );

  return { context, extensions, incalls };
}

function findExtension(state, did) {
  return state.extensions.find(
    (extension) =>
      extension.context === state.context.name &&
      String(extension.exten) === did
  );
}

function findLinkedIncall(state, extension) {
  if (!extension) return null;

  return state.incalls.find(
    (incall) => associated(incall, extension)
  );
}

function resultView(did, context, extension, incall) {
  return {
    did,
    contextId: context.id,
    contextName: context.name,
    extensionId: extension.id,
    incallId: incall.id,
    destination: incall.destination,
    configured: true,
    carrierConnected: false,
  };
}

async function list(tenant) {
  validateTenant(tenant);
  const token = await getToken();
  const state = await loadState(token, tenant);

  const items = [];

  for (const extension of state.extensions) {
    if (
      extension.tenant_uuid !== tenant ||
      extension.context !== state.context.name
    ) continue;

    const incall = findLinkedIncall(state, extension);

    if (!incall || incall.tenant_uuid !== tenant) continue;

    items.push(
      resultView(
        extension.exten,
        state.context,
        extension,
        incall
      )
    );
  }

  return {
    tenantUuid: tenant,
    total: items.length,
    items,
  };
}

async function get(tenant, rawIncallId) {
  validateTenant(tenant);

  const incallId = id(rawIncallId, 'incall ID');
  const token = await getToken();

  const incall = checkTenant(
    await repo.getIncall(token, tenant, incallId),
    tenant,
    'Incoming call'
  );

  return { incall: formatIncall(incall) };
}

async function create(tenant, body) {
  validateTenant(tenant);

  const did = body?.did;
  const ivrId = id(body?.ivrId, 'IVR ID');

  if (
    typeof did !== 'string' ||
    !DID_PATTERN.test(did)
  ) {
    throw new HttpError(
      400,
      'Local test DID must be eight digits beginning with 9'
    );
  }

  const jobKey = `${tenant}:${did}`;

  if (jobs.has(jobKey)) {
    throw new HttpError(
      409,
      'Provisioning is already running for this DID'
    );
  }

  jobs.add(jobKey);

  let stage = 'validation';
  let createdExtensionId = null;
  let createdIncallId = null;

  try {
    const token = await getToken();

    const ivr = checkTenant(
      await repo.getIvr(token, tenant, ivrId),
      tenant,
      'IVR'
    );

    if (!ivr.id) {
      throw new HttpError(404, 'IVR not found');
    }

    const state = await loadState(token, tenant);
    const context = state.context;

    // A DID must not be claimed by a resource
    // in another context or tenant.
    const sameDid = state.extensions.filter(
      (extension) => String(extension.exten) === did
    );

    if (
      sameDid.some(
        (extension) =>
          extension.context !== context.name ||
          extension.tenant_uuid !== tenant
      )
    ) {
      throw new HttpError(
        409,
        'Test DID is already used by another context'
      );
    }

    let extension = findExtension(state, did);
    let incall = findLinkedIncall(state, extension);

    if (incall) {
      if (incall.tenant_uuid !== tenant) {
        throw new HttpError(
          409,
          'Existing incoming call belongs to another tenant'
        );
      }

      if (
        incall.destination?.type !== 'ivr' ||
        Number(incall.destination.ivr_id) !== ivrId
      ) {
        throw new HttpError(
          409,
          'DID already routes to a different destination'
        );
      }

    stage = 'asterisk-activation';

const activation = await activateDid({
  tenantUuid: tenant,
  context: context.name,
  did,
  incallId: incall.id,
});

return {
  success: true,
  created: false,
  message: 'Existing DID verified and activated',
  route: {
    ...resultView(
      did,
      context,
      extension,
      incall
    ),
    activation,
  },
};
    }

    // Fail closed if the DID already exists but
    // is not associated with an incall. Such an
    // entry may be the result of earlier provisioning.
    if (extension) {
      throw new HttpError(
        409,
        'DID extension exists without a linked incall; reconcile before retrying'
      );
    }

    const ranges = Array.isArray(context.incall_ranges)
      ? context.incall_ranges
      : [];

    const exactRange = ranges.find(
      (range) =>
        String(range.start) === did &&
        String(range.end || range.start) === did &&
        Number(range.did_length) === did.length
    );

    if (!exactRange) {
      // Avoid overwriting an existing DID range
      // configuration, which may serve other numbers.
      if (ranges.length !== 0) {
        throw new HttpError(
          409,
          'Incoming context has other ranges; review before modifying'
        );
      }

      stage = 'context-range';

      await repo.updateContext(
        token,
        tenant,
        context.id,
        {
          incall_ranges: [
            {
              start: did,
              end: did,
              did_length: did.length,
            },
          ],
        }
      );

      const refreshed = await repo.getContext(
        token,
        tenant,
        context.id
      );

      checkTenant(refreshed, tenant, 'Incoming context');

      if (
        !refreshed.incall_ranges?.some(
          (range) =>
            String(range.start) === did &&
            String(range.end || range.start) === did
        )
      ) {
        throw new Error(
          'Wazo did not retain the incoming DID range'
        );
      }
    }

    stage = 'extension';

    extension = await repo.createExtension(
      token,
      tenant,
      {
        exten: did,
        context: context.name,
        enabled: true,
      }
    );

    createdExtensionId = extension?.id;

    if (!createdExtensionId) {
      throw new Error(
        'Extension creation returned no ID'
      );
    }

    checkTenant(extension, tenant, 'Created extension');

    stage = 'incall';

    incall = await repo.createIncall(
      token,
      tenant,
      {
        description: `Local test DID ${did}`,
        destination: {
          type: 'ivr',
          ivr_id: ivrId,
        },
      }
    );

    createdIncallId = incall?.id;

    if (!createdIncallId) {
      throw new Error('Incall creation returned no ID');
    }

    checkTenant(incall, tenant, 'Created incall');

    stage = 'association';

    await repo.associate(
      token,
      tenant,
      incall.id,
      extension.id
    );

    stage = 'verification';

    const verified = checkTenant(
      await repo.getIncall(token, tenant, incall.id),
      tenant,
      'Incoming call'
    );

    if (
      !associated(verified, extension) ||
      verified.destination?.type !== 'ivr' ||
      Number(verified.destination?.ivr_id) !== ivrId
    ) {
      throw new Error(
        'Incall association or destination verification failed'
      );
    }

    stage = 'asterisk-activation';

const activation = await activateDid({
  tenantUuid: tenant,
  context: context.name,
  did,
  incallId: verified.id,
});

return {
  success: true,
  created: true,
  message: 'DID provisioned and activated',
  route: {
    ...resultView(
      did,
      context,
      extension,
      verified
    ),
    activation,
  },
};

  } catch (error) {
    if (stage !== 'validation') {
      console.error('[DID provisioning] Needs reconciliation', {
        tenant,
        did,
        stage,
        createdExtensionId,
        createdIncallId,
        error: error.message,
      });

      throw new HttpError(
        502,
        `DID provisioning stopped at ${stage}. ` +
        'Inspect Wazo resources before retrying.'
      );
    }

    throw error;
  } finally {
    jobs.delete(jobKey);
  }
}



async function activate(tenant, rawIncallId) {
  validateTenant(tenant);

  const incallId = id(rawIncallId, 'incall ID');
  const jobKey = `${tenant}:incall:${incallId}`;

  if (jobs.has(jobKey)) {
    throw new HttpError(
      409,
      'Activation is already running for this incall'
    );
  }

  jobs.add(jobKey);

  try {
    const token = await getToken();
    const state = await loadState(token, tenant);

    const incall = checkTenant(
      await repo.getIncall(token, tenant, incallId),
      tenant,
      'Incoming call'
    );

    if (
      incall.destination?.type !== 'ivr' ||
      !Number.isSafeInteger(
        Number(incall.destination.ivr_id)
      ) ||
      Number(incall.destination.ivr_id) <= 0
    ) {
      throw new HttpError(
        409,
        'Incoming call does not have a valid IVR destination'
      );
    }

    const ivrId = Number(incall.destination.ivr_id);

    checkTenant(
      await repo.getIvr(token, tenant, ivrId),
      tenant,
      'IVR'
    );

    // Find the extension actually linked to this incall.
    const linkedIds = new Set(
      getExtensions(incall).map(
        (item) => Number(item.id)
      )
    );

    const candidates = state.extensions.filter(
      (extension) =>
        linkedIds.has(Number(extension.id)) &&
        extension.context === state.context.name &&
        extension.tenant_uuid === tenant
    );

    if (candidates.length !== 1) {
      throw new HttpError(
        409,
        'Expected exactly one tenant-owned incoming extension'
      );
    }

    const extension = candidates[0];
    const did = String(extension.exten);

    const activation = await activateDid({
      tenantUuid: tenant,
      context: state.context.name,
      did,
      incallId,
    });

    return {
      success: true,
      message: 'DID activated and verified',
      route: {
        ...resultView(
          did,
          state.context,
          extension,
          incall
        ),
        activation,
      },
    };
  } catch (error) {
    if (error.status || error.statusCode) {
      throw error;
    }

    console.error('[DID activation] Failed', {
      tenant,
      incallId,
      error: error.message,
    });

    throw new HttpError(
      502,
      'DID activation failed. Inspect Asterisk and Wazo configuration.'
    );
  } finally {
    jobs.delete(jobKey);
  }
}


module.exports = { list, get, create ,activate };
