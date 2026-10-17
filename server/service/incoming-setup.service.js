
const tenantRepo = require('../repository/tenant.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const HttpError = require('../utils/httpError');

const activeJobs = new Set();

function getContexts(response, tenant) {
  if (
    !Array.isArray(response?.items) ||
    !Number.isSafeInteger(response?.total) ||
    response.items.length !== response.total
  ) {
    throw new HttpError(
      502,
      'Wazo returned an incomplete contexts collection'
    );
  }

  return response.items.filter(
    (context) => context.tenant_uuid === tenant
  );
}

function formatContext(context) {
  return {
    id: context.id,
    uuid: context.uuid,
    name: context.name,
    label: context.label,
    type: context.type,
    enabled: context.enabled,
    tenantUuid: context.tenant_uuid,
    incallRanges: context.incall_ranges || [],
  };
}

async function findIncomingContext(token, tenant) {
  const response = await tenantRepo.listContexts(token, tenant);
  const contexts = getContexts(response, tenant);

  const incoming = contexts.filter(
    (context) => context.type === 'incall'
  );

  if (incoming.length > 1) {
    throw new HttpError(
      409,
      'Multiple incoming contexts exist. Review them before provisioning.'
    );
  }

  return incoming[0] || null;
}

async function get(tenant) {
  validateTenant(tenant);

  const token = await getToken();
  const context = await findIncomingContext(token, tenant);

  return {
    tenantUuid: tenant,
    configured: Boolean(context),
    context: context ? formatContext(context) : null,
  };
}

async function create(tenant) {
  validateTenant(tenant);

  if (activeJobs.has(tenant)) {
    throw new HttpError(
      409,
      'Incoming-call setup is already running'
    );
  }

  activeJobs.add(tenant);

  try {
    const token = await getToken();

    // Verify the company exists.
    await tenantRepo.get(token, tenant);

    const existing = await findIncomingContext(token, tenant);

    if (existing) {
      return {
        success: true,
        created: false,
        message: 'Existing incoming context reused',
        context: formatContext(existing),
      };
    }

    // Do not invent a DID range before we know the
    // phone number format supplied by the SIP carrier.
    const payload = {
      label: 'incoming-calls',
      type: 'incall',
      enabled: true,
      incall_ranges: [],
    };

    const created = await tenantRepo.createContext(
      token,
      tenant,
      payload
    );

    if (!created?.id) {
      throw new HttpError(
        502,
        'Wazo returned no context ID. Inspect contexts before retrying.'
      );
    }

    if (created.tenant_uuid !== tenant) {
      throw new HttpError(
        502,
        'Created incoming context tenant could not be verified'
      );
    }

    return {
      success: true,
      created: true,
      message: 'Incoming calling context created successfully',
      context: formatContext(created),
    };
  } finally {
    activeJobs.delete(tenant);
  }
}

module.exports = {
  get,
  create,
};
