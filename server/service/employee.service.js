
const repo = require('../repository/employee.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const {
  validateTenant,
  validateEmployee,
} = require('../models/employee.model');
const HttpError = require('../utils/httpError');

function items(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }
  return [];
}

function validateUserId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'Valid Wazo user ID is required');
  }

  return id;
}

function validateExtension(value) {
  if (typeof value !== 'string' ||
      !/^[0-9]{2,10}$/.test(value)) {
    throw new HttpError(
      400,
      'Extension must contain 2-10 digits'
    );
  }

  return value;
}

function isInUserRange(context, extension) {
  const number = Number(extension);

  return (context.user_ranges || []).some((range) => {
    const start = Number(range.start);
    const end = Number(range.end);

    return Number.isInteger(start) &&
      Number.isInteger(end) &&
      number >= start &&
      number <= end;
  });
}

async function listUsers(tenant) {
  validateTenant(tenant);
  return repo.listUsers(await getToken(), tenant);
}

async function createUser(tenant, body) {
  validateTenant(tenant);

  const employee = validateEmployee(body);

  return repo.createUser(
    await getToken(),
    tenant,
    employee
  );
}

async function getCallingSetup(tenant) {
  validateTenant(tenant);

  const token = await getToken();

  const [contexts, extensions] = await Promise.all([
    repo.listContexts(token, tenant),
    repo.listExtensions(token, tenant),
  ]);

  return {
    tenantUuid: tenant,
    contexts,
    extensions,
  };
}

async function previewPhoneSetup(tenant, rawUserId, body) {
  validateTenant(tenant);

  const userId = validateUserId(rawUserId);
  const extension = validateExtension(body?.extension);
  const token = await getToken();

  const user = await repo.getUser(token, tenant, userId);

  if (user.tenant_uuid !== tenant) {
    throw new HttpError(
      403,
      'Employee does not belong to this tenant'
    );
  }

  if (user.enabled === false) {
    throw new HttpError(
      409,
      'Employee is disabled'
    );
  }

  if (Array.isArray(user.lines) && user.lines.length > 0) {
    throw new HttpError(
      409,
      'Employee already has a Wazo line'
    );
  }

  const [contextsResponse, extensionsResponse] =
    await Promise.all([
      repo.listContexts(token, tenant),
      repo.listExtensions(token, tenant),
    ]);

  // Fail closed if a Wazo collection is incomplete.
  for (const response of [contextsResponse, extensionsResponse]) {
    if (
      typeof response?.total === 'number' &&
      items(response).length < response.total
    ) {
      throw new HttpError(
        409,
        'Wazo returned a partial collection. ' +
        'Pagination must be handled before provisioning.'
      );
    }
  }

  const contexts = items(contextsResponse);
  const extensions = items(extensionsResponse);

  const context = contexts.find((item) =>
    item.tenant_uuid === tenant &&
    item.type === 'internal' &&
    item.enabled === true &&
    isInUserRange(item, extension)
  );

  if (!context) {
    throw new HttpError(
      409,
      'No enabled internal context allows this extension'
    );
  }

  const alreadyUsed = extensions.some((item) =>
    item.context === context.name &&
    item.exten === extension
  );

  if (alreadyUsed) {
    throw new HttpError(
      409,
      `Extension ${extension} is already in use`
    );
  }

  return {
    ready: true,
    message: 'Phone setup preflight passed',
    tenantUuid: tenant,
    employee: {
      id: user.id,
      uuid: user.uuid,
      name: [user.firstname, user.lastname]
        .filter(Boolean)
        .join(' '),
    },
    extension,
    context: {
      id: context.id,
      name: context.name,
      label: context.label,
    },
    nextStep: 'Provision SIP endpoint, line and associations',
  };
}

module.exports = {
  listUsers,
  createUser,
  getCallingSetup,
  previewPhoneSetup,
};
