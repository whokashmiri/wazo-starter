const repo = require('../repository/tenant.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const HttpError = require('../utils/httpError');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTERNAL_CONTEXT_LABEL = 'internal-office';

const DEFAULT_USER_RANGE = {
  start: '1000',
  end: '1999',
};

function validateTenantUuid(uuid) {
  if (typeof uuid !== 'string' || !UUID_REGEX.test(uuid)) {
    throw new HttpError(400, 'Valid tenant UUID is required');
  }

  return uuid;
}

function unwrapItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.data)) return data.data;

  return [];
}

function supportsExtensionRange(context, start, end) {
  const ranges = Array.isArray(context.user_ranges)
    ? context.user_ranges
    : [];

  return ranges.some((range) => {
    const rangeStart = Number(range.start);
    const rangeEnd = Number(range.end);

    return (
      Number.isInteger(rangeStart) &&
      Number.isInteger(rangeEnd) &&
      rangeStart <= start &&
      rangeEnd >= end
    );
  });
}

function toContextResponse(context, created) {
  return {
    created,
    context: {
      id: context.id,
      uuid: context.uuid || null,
      name: context.name,
      label: context.label,
      type: context.type,
      enabled: context.enabled,
      tenant_uuid: context.tenant_uuid,
      user_ranges: context.user_ranges || [],
    },
  };
}

async function list() {
  return repo.list(await getToken());
}

async function create(rawName) {
  const name = typeof rawName === 'string'
    ? rawName.trim()
    : '';

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(
      400,
      'Company name must be 2-80 characters',
    );
  }

  return repo.create(await getToken(), name);
}

async function setupCalling(rawTenantUuid) {
  const tenantUuid = validateTenantUuid(rawTenantUuid);
  const token = await getToken();

  // Verify the tenant exists before modifying resources.
  await repo.get(token, tenantUuid);

  // Read contexts belonging to this tenant.
  const response = await repo.listContexts(token, tenantUuid);
  const contexts = unwrapItems(response).filter(
    (context) => context.tenant_uuid === tenantUuid,
  );

  // Reuse an existing enabled internal context covering 1000-1999.
  const existing = contexts.find(
    (context) =>
      context.type === 'internal' &&
      context.enabled === true &&
      supportsExtensionRange(
        context,
        Number(DEFAULT_USER_RANGE.start),
        Number(DEFAULT_USER_RANGE.end),
      ),
  );

  if (existing) {
    return {
      tenantUuid,
      message: 'Existing internal context reused',
      ...toContextResponse(existing, false),
    };
  }

  // Avoid creating a second internal context when an existing
  // one requires review or has a different extension range.
  const otherInternalContexts = contexts.filter(
    (context) => context.type === 'internal',
  );

  if (otherInternalContexts.length > 0) {
    throw new HttpError(
      409,
      'Tenant already has an internal context with a different ' +
      'configuration. Review it before creating another.',
    );
  }

  const payload = {
    label: INTERNAL_CONTEXT_LABEL,
    type: 'internal',
    enabled: true,
    user_ranges: [
      { ...DEFAULT_USER_RANGE },
    ],
  };

  // A second read reduces accidental duplicate creation if
  // the context was added between the earlier operations.
  const latest = unwrapItems(
    await repo.listContexts(token, tenantUuid),
  ).filter((context) => context.tenant_uuid === tenantUuid);

  if (latest.some((context) => context.type === 'internal')) {
    throw new HttpError(
      409,
      'An internal context was created concurrently. Refresh and retry.',
    );
  }

  const created = await repo.createContext(
    token,
    tenantUuid,
    payload,
  );

  if (!created?.id || !created?.name) {
    throw new HttpError(
      502,
      'Wazo returned an incomplete context response. ' +
      'Check calling setup before retrying.',
    );
  }

  return {
    tenantUuid,
    message: 'Internal calling context created successfully',
    ...toContextResponse(created, true),
  };
}

module.exports = {
  list,
  create,
  setupCalling,
};