
const crypto = require('node:crypto');

const repo = require('../repository/department.repository');
const tenantRepo = require('../repository/tenant.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const employeeRepo = require('../repository/employee.repository');
const { reloadAsterisk } = require('../integrations/wazo/wazo.reload');
const HttpError = require('../utils/httpError');

const STRATEGIES = new Set([
  'ringall',
  'rrmemory',
  'leastrecent',
  'fewestcalls',
  'random',
  'linear',
]);

// Local process protection against duplicate submissions.
// Production will require a distributed provisioning lock.
const activeCreations = new Set();

function normalizeName(value) {
  const name = typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ')
    : '';

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(
      400,
      'Department name must contain 2-80 characters',
    );
  }

  return name;
}

function normalizeStrategy(value) {
  const strategy = value === undefined
    ? 'ringall'
    : value;

  if (typeof strategy !== 'string' ||
      !STRATEGIES.has(strategy)) {
    throw new HttpError(
      400,
      'Invalid queue strategy',
    );
  }

  return strategy;
}

function validateQueueId(value) {
  const queueId = Number(value);

  if (
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(queueId)
  ) {
    throw new HttpError(400, 'Invalid queue ID');
  }

  return queueId;
}

async function fetchAll(token, tenant) {
  const result = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await repo.list(
      token,
      tenant,
      offset,
      limit,
    );

    if (
      !response ||
      !Array.isArray(response.items) ||
      !Number.isSafeInteger(response.total) ||
      response.total < 0
    ) {
      throw new HttpError(
        502,
        'Unexpected Wazo queues response',
      );
    }

    result.push(...response.items);

    if (result.length >= response.total) {
      return result;
    }

    if (response.items.length === 0) {
      throw new HttpError(
        502,
        'Wazo queue pagination stopped unexpectedly',
      );
    }

    offset += response.items.length;
  }
}

function toDepartment(queue) {
  return {
    id: queue.id,
    tenantUuid: queue.tenant_uuid,
    name: queue.label || queue.name,
    queueName: queue.name,
    queueId: queue.id,
    strategy: Array.isArray(queue.options)
      ? queue.options.find(
          (item) =>
            Array.isArray(item) &&
            item[0] === 'strategy'
        )?.[1] || null
      : null,
    members: queue.members || {
      users: [],
      agents: [],
    },
  };
}

async function list(tenant) {
  validateTenant(tenant);

  const token = await getToken();
  const queues = await fetchAll(token, tenant);

  return {
    tenantUuid: tenant,
    total: queues.length,
    items: queues
      .filter((queue) => queue.tenant_uuid === tenant)
      .map(toDepartment),
  };
}

async function get(tenant, rawQueueId) {
  validateTenant(tenant);

  const queueId = validateQueueId(rawQueueId);
  const token = await getToken();

  const queue = await repo.get(
    token,
    tenant,
    queueId,
  );

  if (queue.tenant_uuid !== tenant) {
    throw new HttpError(
      404,
      'Department not found in this tenant',
    );
  }

  return toDepartment(queue);
}

async function create(tenant, body) {
  validateTenant(tenant);

  const name = normalizeName(body?.name);
  const strategy = normalizeStrategy(body?.strategy);

  const lockKey = `${tenant}:${name.toLocaleLowerCase('en')}`;

  if (activeCreations.has(lockKey)) {
    throw new HttpError(
      409,
      'Department creation already in progress',
    );
  }

  activeCreations.add(lockKey);

  try {
    const token = await getToken();

    // Verify the requested tenant exists.
    await tenantRepo.get(token, tenant);

    const existing = await fetchAll(token, tenant);

    const duplicate = existing.find(
      (queue) =>
        queue.tenant_uuid === tenant &&
        String(queue.label || '').toLocaleLowerCase('en') ===
          name.toLocaleLowerCase('en'),
    );

    if (duplicate) {
      throw new HttpError(
        409,
        'A department with this name already exists',
      );
    }

    // Unique internal queue identifier.
    // The human-readable department name is stored in label.
    const queueName =
      'dept-' + crypto.randomBytes(8).toString('hex');

    const payload = {
      name: queueName,
      label: name,
      timeout: 30,
      options: [
        ['strategy', strategy],
      ],
    };

    const created = await repo.create(
      token,
      tenant,
      payload,
    );

    if (!created?.id) {
      throw new HttpError(
        502,
        'Wazo queue creation returned no queue ID. ' +
        'Inspect the tenant queues before retrying.',
      );
    }

    const queue = await repo.get(
      token,
      tenant,
      created.id,
    );

    if (queue.tenant_uuid !== tenant) {
      throw new HttpError(
        502,
        'Created queue tenant could not be verified',
      );
    }

    return {
      success: true,
      message: 'Department and Wazo queue created successfully',
      department: toDepartment(queue),
    };
  } finally {
    activeCreations.delete(lockKey);
  }
}

async function addMember(tenant, rawQueueId, body) {
  validateTenant(tenant);

  const queueId = validateQueueId(rawQueueId);
  const userId = Number(body?.userId);

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new HttpError(
      400,
      'Valid employee userId is required',
    );
  }

  const token = await getToken();

  // Verify the department belongs to this tenant.
  const queue = await repo.get(token, tenant, queueId);

  if (queue.tenant_uuid !== tenant) {
    throw new HttpError(
      404,
      'Department not found in this tenant',
    );
  }

  // Verify the employee belongs to the same tenant.
  const user = await employeeRepo.getUser(
    token,
    tenant,
    userId,
  );

  if (user.tenant_uuid !== tenant) {
    throw new HttpError(
      404,
      'Employee not found in this tenant',
    );
  }

  if (user.enabled !== true) {
    throw new HttpError(
      409,
      'Employee is disabled',
    );
  }

  if (!Array.isArray(user.lines) || user.lines.length === 0) {
    throw new HttpError(
      409,
      'Employee must have a configured SIP line',
    );
  }

  // Queue membership should never be duplicated.
 const members = queue.members?.users;

if (!Array.isArray(members) || members.length === 0) {
  throw new HttpError(
    409,
    'Assign at least one employee before configuring the queue extension'
  );
}

const alreadyMember = members.some(
  (member) => member.uuid === user.uuid,
);

  if (alreadyMember) {
    return {
      success: true,
      created: false,
      message: 'Employee is already assigned to this department',
      queueId,
      userId,
    };
  }

  await repo.addUserMember(
    token,
    tenant,
    queueId,
    userId,
    1,
  );

  // Verify association after writing.
  const updated = await repo.get(token, tenant, queueId);

 const verified = (updated.members?.users || []).some(
  (member) => member.uuid === user.uuid,
);

  if (!verified) {
    throw new HttpError(
      409,
      'Wazo membership association could not be verified. ' +
      'Inspect the queue before retrying.',
    );
  }

  // Apply local Asterisk configuration.
  const asterisk = await reloadAsterisk();

  return {
    success: true,
    created: true,
    message: 'Employee assigned to department successfully',
    tenantUuid: tenant,
    department: {
      id: updated.id,
      name: updated.label || updated.name,
    },
    employee: {
      id: user.id,
      name: [user.firstname, user.lastname]
        .filter(Boolean)
        .join(' '),
    },
    asterisk,
  };
}


const queueExtensionJobs = new Set();

function validExtension(value) {
  return typeof value === 'string' &&
    /^[0-9]{2,10}$/.test(value);
}

async function getAllExtensions(token, tenant) {
  const results = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await repo.listExtensions(
      token,
      tenant,
      offset,
      limit
    );

    if (
      !Array.isArray(response?.items) ||
      !Number.isSafeInteger(response?.total)
    ) {
      throw new HttpError(
        502,
        'Unexpected Wazo extension response'
      );
    }

    results.push(...response.items);

    if (results.length >= response.total) {
      return results;
    }

    if (response.items.length === 0) {
      throw new HttpError(
        502,
        'Incomplete Wazo extension collection'
      );
    }

    offset += response.items.length;
  }
}

function rangeContains(ranges, extension) {
  const number = Number(extension);

  return Array.isArray(ranges) &&
    ranges.some((range) =>
      Number(range.start) <= number &&
      Number(range.end) >= number
    );
}

async function setupQueueExtension(tenant, rawQueueId, body) {
  validateTenant(tenant);

  const queueId = validateQueueId(rawQueueId);
  const extension = body?.extension;

  if (!validExtension(extension)) {
    throw new HttpError(
      400,
      'Extension must contain 2-10 digits'
    );
  }

  const jobKey = `${tenant}:${queueId}`;

  if (queueExtensionJobs.has(jobKey)) {
    throw new HttpError(
      409,
      'Queue extension setup is already running'
    );
  }

  queueExtensionJobs.add(jobKey);

  let stage = 'validation';
  let createdExtensionId = null;

  try {
    const token = await getToken();

    const queue = await repo.get(token, tenant, queueId);

    if (queue.tenant_uuid !== tenant) {
      throw new HttpError(
        404,
        'Department not found in this tenant'
      );
    }

    // Queue already has a dialable extension.
    // Do not create another one automatically.
    if (
      !Array.isArray(queue.extensions)
    ) {
      throw new HttpError(
        502,
        'Wazo did not provide queue extensions'
      );
    }

    if (queue.extensions.length > 0) {
      const existing = queue.extensions.find(
        (item) => item.exten === extension
      );

      if (!existing) {
        throw new HttpError(
          409,
          'Department already has another extension'
        );
      }

      return {
        success: true,
        created: false,
        message: 'Department extension already configured',
        tenantUuid: tenant,
        department: {
          id: queue.id,
          name: queue.label || queue.name,
        },
        extension: existing.exten,
        extensionId: existing.id,
        context: existing.context,
      };
    }

    // Verify queue members before making a callable route.
 const members = queue.members?.users;

if (!Array.isArray(members) || members.length === 0) {
  throw new HttpError(
    409,
    'Assign at least one employee before configuring the queue extension'
  );
}
    const hasAgent3 = members.some(
      (member) =>
        member.uuid ===
        'eab1897d-b311-42d0-ad4d-7bf0468ca192'
    );

    // Check that the queue has the required test membership.
    if (!hasAgent3 || members.length < 2) {
      throw new HttpError(
        409,
        'Assign Agent 3 and Agent 4 before configuring the queue extension'
      );
    }

    // Find this tenant's internal context.
    const contextsResponse =
      await employeeRepo.listContexts(token, tenant);

    const contexts = contextsResponse?.items || [];

    const context = contexts.find(
      (item) =>
        item.tenant_uuid === tenant &&
        item.type === 'internal' &&
        item.enabled === true
    );

    if (!context) {
      throw new HttpError(
        409,
        'No enabled internal context found'
      );
    }

    // Check all existing extensions in this tenant.
    const existingExtensions =
      await getAllExtensions(token, tenant);

    const occupied = existingExtensions.some(
      (item) =>
        item.context === context.name &&
        item.exten === extension
    );

    if (occupied) {
      throw new HttpError(
        409,
        `Extension ${extension} is already in use`
      );
    }

    // Protect queue numbering: we use 2000-2099.
    const number = Number(extension);

    if (number < 2000 || number > 2099) {
      throw new HttpError(
        400,
        'Department extension must be in range 2000-2099'
      );
    }

    // Ensure no conflicting range already covers the number.
    const otherRangeTypes = [
      'user_ranges',
      'group_ranges',
      'conference_room_ranges',
      'incall_ranges',
    ];

    for (const field of otherRangeTypes) {
      if (rangeContains(context[field], extension)) {
        throw new HttpError(
          409,
          `Extension overlaps existing ${field}`
        );
      }
    }

    // Enable queue numbers in this tenant's internal context.
    const freshContext = await repo.getContext(
      token,
      tenant,
      context.id
    );

    if (
      freshContext.tenant_uuid !== tenant ||
      freshContext.type !== 'internal'
    ) {
      throw new HttpError(
        409,
        'Context ownership or type changed'
      );
    }

    const queueRanges = freshContext.queue_ranges || [];

    if (!rangeContains(queueRanges, extension)) {
      stage = 'update-context';

      // Preserve all existing writable range categories.
      // Do not send auto-generated context fields back to Wazo.
      const updatedRanges = [
        ...queueRanges,
        { start: '2000', end: '2099' },
      ];

      const rangeFields = [
        'user_ranges',
        'group_ranges',
        'queue_ranges',
        'conference_room_ranges',
        'incall_ranges',
      ];

      const contextBody = {
        label: freshContext.label,
        type: freshContext.type,
        enabled: freshContext.enabled,
        queue_ranges: updatedRanges,
      };

      for (const field of rangeFields) {
        if (
          field !== 'queue_ranges' &&
          Array.isArray(freshContext[field])
        ) {
          contextBody[field] = freshContext[field];
        }
      }

      await repo.updateContext(
        token,
        tenant,
        freshContext.id,
        contextBody
      );

      const verifiedContext = await repo.getContext(
        token,
        tenant,
        freshContext.id
      );

      if (
        !rangeContains(
          verifiedContext.queue_ranges,
          extension
        )
      ) {
        throw new Error(
          'Queue extension range could not be verified'
        );
      }
    }

    stage = 'create-extension';

    const created = await repo.createExtension(
      token,
      tenant,
      extension,
      context.name
    );

    if (!created?.id) {
      throw new Error(
        'Wazo extension creation returned no ID'
      );
    }

    createdExtensionId = created.id;

    stage = 'associate-queue-extension';

    await repo.associateQueueExtension(
      token,
      tenant,
      queueId,
      created.id
    );

    stage = 'verify';

    const updatedQueue = await repo.get(
      token,
      tenant,
      queueId
    );

    const linked = (updatedQueue.extensions || []).find(
      (item) =>
        Number(item.id) === Number(created.id) &&
        item.exten === extension &&
        item.context === context.name
    );

    if (!linked) {
      throw new Error(
        'Queue extension association could not be verified'
      );
    }

    stage = 'reload';

    const asterisk = await reloadAsterisk();

    return {
      success: true,
      created: true,
      message: 'Department extension configured successfully',
      tenantUuid: tenant,
      department: {
        id: queueId,
        name: updatedQueue.label || updatedQueue.name,
      },
      extension,
      extensionId: created.id,
      context: context.name,
      asterisk,
    };
  } catch (error) {
    if (stage !== 'validation') {
      console.error('[QueueExtensionSetup]', {
        stage,
        tenant,
        queueId,
        createdExtensionId,
      });

      throw new HttpError(
        409,
        'Queue extension setup could not be completed or verified. ' +
        'Inspect Wazo resources before retrying.'
      );
    }

    throw error;
  } finally {
    queueExtensionJobs.delete(jobKey);
  }
}


module.exports = {
  list,
  get,
  create,
  addMember,
  setupQueueExtension
};
