
const repo = require('../repository/sip-trunk.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const {
  getPeerIp,
  activate: activateAsterisk,
} = require('../integrations/wazo/wazo.trunk-activation');
const { validateTenant } = require('../models/employee.model');
const HttpError = require('../utils/httpError');

const TEST_NAME = 'saas-local-test-trunk';
const ENDPOINT_PREFIX = 'saas-test-';
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const jobs = new Set();

function assertItems(response, label) {
  if (
    !Array.isArray(response?.items) ||
    response.items.length !== response.total
  ) {
    throw new HttpError(
      502,
      `Cannot verify complete ${label} collection`
    );
  }

  return response.items;
}

function owns(item, tenant, label) {
  if (!item || item.tenant_uuid !== tenant) {
    throw new HttpError(
      404,
      `${label} not found for this tenant`
    );
  }

  return item;
}

function optionValue(options, name) {
  return (options || []).find(
    item => Array.isArray(item) && item[0] === name
  )?.[1];
}

function trunkEndpointUuid(trunk) {
  return trunk.endpoint_sip?.uuid || null;
}

function formatTrunk(trunk) {
  return {
    id: trunk.id,
    name: trunk.name,
    context: trunk.context,
    tenantUuid: trunk.tenant_uuid,
    endpointSipUuid: trunkEndpointUuid(trunk),
    registrationConfigured: false,
    testOnly: true,
  };
}

async function getIncomingContext(token, tenant) {
  const contexts = assertItems(
    await repo.listContexts(token, tenant),
    'contexts'
  );

  const matches = contexts.filter(
    item =>
      item.tenant_uuid === tenant &&
      item.type === 'incall' &&
      item.enabled === true
  );

  if (matches.length !== 1) {
    throw new HttpError(
      409,
      'Exactly one enabled incoming context is required'
    );
  }

  return matches[0];
}

async function load(token, tenant) {
  const [trunksResponse, endpointsResponse] = await Promise.all([
    repo.listTrunks(token, tenant),
    repo.listSipEndpoints(token, tenant),
  ]);

  return {
    trunks: assertItems(trunksResponse, 'trunks'),
    endpoints: assertItems(endpointsResponse, 'SIP endpoints'),
  };
}

async function list(tenant) {
  validateTenant(tenant);
  const token = await getToken();
  const state = await load(token, tenant);

  return {
    tenantUuid: tenant,
    items: state.trunks
      .filter(item => item.tenant_uuid === tenant)
      .map(item => ({
        id: item.id,
        name: item.name,
        context: item.context,
        tenantUuid: item.tenant_uuid,
        endpointSipUuid: trunkEndpointUuid(item),
      })),
  };
}

async function get(tenant, rawId) {
  validateTenant(tenant);

  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid trunk ID');
  }

  const token = await getToken();
  const trunk = owns(
    await repo.getTrunk(token, tenant, id),
    tenant,
    'Trunk'
  );

  return { trunk: formatTrunk(trunk) };
}

async function createLocalTest(tenant) {
  validateTenant(tenant);

  if (jobs.has(tenant)) {
    throw new HttpError(
      409,
      'Trunk provisioning already running'
    );
  }

  jobs.add(tenant);

  let stage = 'preflight';
  let sipUuid = null;
  let trunkId = null;

  try {
    const token = await getToken();

    const incomingContext = await getIncomingContext(
      token,
      tenant
    );

   const tenantDetails = await repo.getTenant(token, tenant);

if (tenantDetails?.uuid !== tenant) {
  throw new HttpError(
    404,
    'Tenant could not be verified'
  );
}

    const templateUuid =
      tenantDetails.global_sip_template_uuid;

    if (!UUID_RE.test(templateUuid || '')) {
      throw new HttpError(
        409,
        'Tenant global SIP template is unavailable'
      );
    }

    owns(
      await repo.getTemplate(token, tenant, templateUuid),
      tenant,
      'SIP template'
    );

    const peerIp = await getPeerIp();

    const state = await load(token, tenant);

    const existingTrunk = state.trunks.find(
      item =>
        item.tenant_uuid === tenant &&
        item.name === TEST_NAME
    );

    if (existingTrunk) {
      throw new HttpError(
        409,
        'Local test trunk already exists. Use the activation endpoint.'
      );
    }

    const existingEndpoint = state.endpoints.find(
      item =>
        item.tenant_uuid === tenant &&
        item.name.startsWith(ENDPOINT_PREFIX)
    );

    if (existingEndpoint) {
      throw new HttpError(
        409,
        'A local test SIP endpoint already exists. Inspect before retrying.'
      );
    }

    // Prevent claiming the same Docker peer address
    // through another Wazo SIP endpoint.
    for (const item of state.endpoints) {
      const full = await repo.getSipEndpoint(
        token,
        tenant,
        item.uuid
      );

      const match = optionValue(
        full.identify_section_options,
        'match'
      );

      if (
        typeof match === 'string' &&
        match.split(',').map(x => x.trim()).some(
          x => x === peerIp || x === `${peerIp}/32`
        )
      ) {
        throw new HttpError(
          409,
          'Test peer IP is already assigned to a SIP endpoint'
        );
      }
    }

    const endpointName =
      `${ENDPOINT_PREFIX}${tenant.slice(0, 8)}`;

    stage = 'create-sip-endpoint';

    const endpoint = await repo.createSipEndpoint(
      token,
      tenant,
      {
        name: endpointName,
        templates: [{ uuid: templateUuid }],

        endpoint_section_options: [
          ['context', incomingContext.name],
          ['disallow', 'all'],
          ['allow', 'ulaw'],
          ['direct_media', 'no'],
          ['dtmf_mode', 'info'],
        ],

        identify_section_options: [
          ['match', `${peerIp}/32`],
        ],
      }
    );

    sipUuid = endpoint?.uuid;

    if (!UUID_RE.test(sipUuid || '')) {
      throw new Error(
        'Wazo returned no SIP endpoint UUID'
      );
    }

    owns(endpoint, tenant, 'Created SIP endpoint');

    stage = 'create-trunk';

    const trunk = await repo.createTrunk(
      token,
      tenant,
      {
        name: TEST_NAME,
        context: incomingContext.name,
      }
    );

    trunkId = trunk?.id;

    if (!Number.isSafeInteger(trunkId) || trunkId <= 0) {
      throw new Error('Wazo returned no trunk ID');
    }

    owns(trunk, tenant, 'Created trunk');

    stage = 'associate';

    await repo.associateSipEndpoint(
      token,
      tenant,
      trunkId,
      sipUuid
    );

    stage = 'verify-wazo';

    const verified = owns(
      await repo.getTrunk(token, tenant, trunkId),
      tenant,
      'Trunk'
    );

    if (
      trunkEndpointUuid(verified) !== sipUuid ||
      verified.context !== incomingContext.name
    ) {
      throw new Error(
        'Trunk association or incoming context was not retained'
      );
    }

    const fullEndpoint = owns(
      await repo.getSipEndpoint(token, tenant, sipUuid),
      tenant,
      'SIP endpoint'
    );

    if (
      optionValue(
        fullEndpoint.endpoint_section_options,
        'context'
      ) !== incomingContext.name ||
      ![
        peerIp,
        `${peerIp}/32`,
      ].includes(
        optionValue(
          fullEndpoint.identify_section_options,
          'match'
        )
      )
    ) {
      throw new Error(
        'Wazo did not retain the expected SIP identity or context'
      );
    }

    stage = 'activate-asterisk';

    const activation = await activateAsterisk({
      endpointName,
      peerIp,
      context: incomingContext.name,
    });

    return {
      success: true,
      created: true,
      trunk: formatTrunk(verified),
      activation,
    };
  } catch (error) {
    console.error('[SIP Trunk] Provisioning stopped', {
      tenant,
      stage,
      trunkId,
      sipUuid,
      error: error.message,
    });

    // Never automatically recreate resources after an
    // uncertain API response or partial failure.
    if (stage !== 'preflight') {
      throw new HttpError(
        502,
        `Trunk provisioning stopped at ${stage}. ` +
        'Inspect existing Wazo resources before retrying.'
      );
    }

    throw error;
  } finally {
    jobs.delete(tenant);
  }
}

async function activate(tenant, rawId) {
  validateTenant(tenant);

  const id = Number(rawId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid trunk ID');
  }

  const token = await getToken();

  const trunk = owns(
    await repo.getTrunk(token, tenant, id),
    tenant,
    'Trunk'
  );

  if (trunk.name !== TEST_NAME) {
    throw new HttpError(
      409,
      'This endpoint only activates managed local test trunks'
    );
  }

  const context = await getIncomingContext(token, tenant);
  const sipUuid = trunkEndpointUuid(trunk);

  if (
    !sipUuid ||
    trunk.context !== context.name
  ) {
    throw new HttpError(
      409,
      'Trunk has no valid SIP endpoint or incoming context'
    );
  }

  const endpoint = owns(
    await repo.getSipEndpoint(token, tenant, sipUuid),
    tenant,
    'SIP endpoint'
  );

  const peerIp = await getPeerIp();

  if (
    endpoint.name !==
      `${ENDPOINT_PREFIX}${tenant.slice(0, 8)}` ||
    optionValue(
      endpoint.endpoint_section_options, 'context'
    ) !== context.name ||
    ![
      peerIp,
      `${peerIp}/32`,
    ].includes(
      optionValue(
        endpoint.identify_section_options, 'match'
      )
    )
  ) {
    throw new HttpError(
      409,
      'SIP endpoint identity or peer address is not valid'
    );
  }

  try {
    const activation = await activateAsterisk({
      endpointName: endpoint.name,
      peerIp,
      context: context.name,
    });

    return {
      success: true,
      trunk: formatTrunk(trunk),
      activation,
    };
  } catch (error) {
    console.error('[SIP Trunk] Activation failed', {
      tenant,
      id,
      error: error.message,
    });

    throw new HttpError(
      502,
      'SIP trunk activation or verification failed'
    );
  }
}

module.exports = {
  list,
  get,
  createLocalTest,
  activate,
};
