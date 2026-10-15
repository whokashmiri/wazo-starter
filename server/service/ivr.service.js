
const repo = require('../repository/ivr.repository');
const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const HttpError = require('../utils/httpError');

const jobs = new Set();

function positiveId(value, label) {
  const str = String(value);
  const id = Number(value);

  if (!/^[1-9]\d*$/.test(str) ||
      !Number.isSafeInteger(id)) {
    throw new HttpError(400, `Invalid ${label}`);
  }

  return id;
}

function normalizeName(value) {
  const name =
    typeof value === 'string' ? value.trim() : '';

  if (name.length < 2 || name.length > 80) {
    throw new HttpError(
      400,
      'IVR name must contain 2-80 characters'
    );
  }

  return name;
}

function normalizeSound(value) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'IVR menuSound is required');
  }

  const sound = value.trim();

  // Only accept absolute paths inside the Wazo sounds volume.
  // This does not prove that the sound exists or is owned
  // by this tenant. See the audio-upload step.
  if (
    !/^\/var\/lib\/wazo\/sounds\/[a-zA-Z0-9/_-]+$/.test(sound) ||
    sound.includes('..')
  ) {
    throw new HttpError(
      400,
      'menuSound must be a valid Wazo sound path without a file extension'
    );
  }

  return sound;
}

function normalizeChoices(value) {
  if (!Array.isArray(value) ||
      value.length < 1 ||
      value.length > 10) {
    throw new HttpError(
      400,
      'IVR must have 1-10 keypad choices'
    );
  }

  const digits = new Set();

  return value.map((choice) => {
    const digit = choice?.digit;

    if (
      typeof digit !== 'string' ||
      !/^[0-9]$/.test(digit)
    ) {
      throw new HttpError(
        400,
        'Each IVR digit must be a single number from 0 to 9'
      );
    }

    if (digits.has(digit)) {
      throw new HttpError(
        400,
        `Duplicate IVR digit ${digit}`
      );
    }

    digits.add(digit);

    return {
      digit,
      queueId: positiveId(choice.queueId, 'queue ID'),
    };
  });
}

function toIvr(ivr) {
  return {
    id: ivr.id,
    tenantUuid: ivr.tenant_uuid,
    name: ivr.name,
    description: ivr.description,
    greetingSound: ivr.greeting_sound || null,
    menuSound: ivr.menu_sound,
    timeout: ivr.timeout,
    maxTries: ivr.max_tries,
    choices: (ivr.choices || []).map((choice) => ({
      digit: choice.exten,
      destination: choice.destination,
    })),
  };
}

async function fetchAll(token, tenant) {
  const result = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await repo.list(
      token, tenant, offset, limit
    );

    if (
      !Array.isArray(response?.items) ||
      !Number.isSafeInteger(response.total)
    ) {
      throw new HttpError(
        502,
        'Unexpected Wazo IVR response'
      );
    }

    result.push(...response.items);

    if (result.length >= response.total) {
      return result;
    }

    if (!response.items.length) {
      throw new HttpError(
        502,
        'Incomplete Wazo IVR collection'
      );
    }

    offset += response.items.length;
  }
}

async function validateQueueChoices(token, tenant, choices) {
  const ids = [...new Set(choices.map((c) => c.queueId))];

  for (const id of ids) {
    const queue = await repo.getQueue(token, tenant, id);

    if (queue.tenant_uuid !== tenant) {
      throw new HttpError(
        404,
        `Queue ${id} does not belong to this tenant`
      );
    }
  }
}

async function list(tenant) {
  validateTenant(tenant);

  const token = await getToken();
  const all = await fetchAll(token, tenant);

  const filtered = all.filter(
    (ivr) => ivr.tenant_uuid === tenant
  );

  return {
    tenantUuid: tenant,
    total: filtered.length,
    items: filtered.map(toIvr),
  };
}

async function get(tenant, rawId) {
  validateTenant(tenant);

  const id = positiveId(rawId, 'IVR ID');
  const token = await getToken();
  const ivr = await repo.get(token, tenant, id);

  if (ivr.tenant_uuid !== tenant) {
    throw new HttpError(404, 'IVR not found');
  }

  return toIvr(ivr);
}

async function create(tenant, body) {
  validateTenant(tenant);

  const name = normalizeName(body?.name);
  const menuSound = normalizeSound(body?.menuSound);
  const choices = normalizeChoices(body?.choices);

  const timeout = body?.timeout ?? 5;
  const maxTries = body?.maxTries ?? 3;

  if (!Number.isInteger(timeout) ||
      timeout < 1 || timeout > 30) {
    throw new HttpError(
      400,
      'timeout must be between 1 and 30 seconds'
    );
  }

  if (!Number.isInteger(maxTries) ||
      maxTries < 1 || maxTries > 10) {
    throw new HttpError(
      400,
      'maxTries must be between 1 and 10'
    );
  }

  const jobKey = `${tenant}:${name.toLowerCase()}`;

  if (jobs.has(jobKey)) {
    throw new HttpError(
      409,
      'IVR creation is already in progress'
    );
  }

  jobs.add(jobKey);

  try {
    const token = await getToken();

    await validateQueueChoices(token, tenant, choices);

    const existing = await fetchAll(token, tenant);

    if (existing.some(
      (ivr) =>
        ivr.tenant_uuid === tenant &&
        ivr.name.toLowerCase() === name.toLowerCase()
    )) {
      throw new HttpError(
        409,
        'An IVR with this name already exists'
      );
    }

    const payload = {
      name,
      description:
        typeof body?.description === 'string'
          ? body.description.trim().slice(0, 250)
          : '',
      menu_sound: menuSound,
      timeout,
      max_tries: maxTries,
      choices: choices.map((choice) => ({
        exten: choice.digit,
        destination: {
          type: 'queue',
          queue_id: choice.queueId,
        },
      })),
    };

    const created = await repo.create(
      token,
      tenant,
      payload
    );

    if (!created?.id) {
      throw new HttpError(
        502,
        'Wazo returned no IVR ID. Inspect IVRs before retrying.'
      );
    }

    const confirmed = await repo.get(
      token,
      tenant,
      created.id
    );

    if (confirmed.tenant_uuid !== tenant) {
      throw new HttpError(
        502,
        'Created IVR tenant could not be verified'
      );
    }

    return {
      success: true,
      message: 'IVR created successfully',
      ivr: toIvr(confirmed),
    };
  } finally {
    jobs.delete(jobKey);
  }
}

module.exports = {
  list,
  get,
  create,
};
