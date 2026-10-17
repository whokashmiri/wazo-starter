
const routeRepo = require('../repository/ivr-route.repository');
const ivrRepo = require('../repository/ivr.repository');
const employeeRepo = require('../repository/employee.repository');

const { getToken } = require('../integrations/wazo/wazo.auth');
const { validateTenant } = require('../models/employee.model');
const HttpError = require('../utils/httpError');

let operationQueue = Promise.resolve();

const CONTEXT_PATTERN = /^ctx-[A-Za-z0-9_-]+$/;
const EXTENSION_PATTERN = /^7\d{3}$/;
const ROUTE_PATTERN =
  /^exten\s*=>\s*(7\d{3}),1,Goto\(xivo-ivr-(\d+),s,1\)$/;

function positiveId(value, name) {
  if (!/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, `Invalid ${name}`);
  }

  return Number(value);
}

function validateExtension(value) {
  if (typeof value !== 'string' ||
      !EXTENSION_PATTERN.test(value)) {
    throw new HttpError(
      400,
      'IVR test extension must be between 7000 and 7999'
    );
  }

  return value;
}

function parseRoutes(content) {
  const routes = [];
  let context = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith(';')) {
      continue;
    }

    const section = line.match(/^\[([^\]]+)\]$/);

    if (section) {
      context = section[1];

      if (!CONTEXT_PATTERN.test(context)) {
        throw new Error(
          'Unsupported context in SaaS route file'
        );
      }

      continue;
    }

    const match = line.match(ROUTE_PATTERN);

    if (!match || !context) {
      throw new Error(
        'Unsupported dialplan entry in SaaS route file'
      );
    }

    routes.push({
      context,
      extension: match[1],
      ivrId: Number(match[2]),
    });
  }

  const keys = new Set();

  for (const route of routes) {
    const key = `${route.context}:${route.extension}`;

    if (keys.has(key)) {
      throw new Error(
        'Duplicate dialplan route in SaaS configuration'
      );
    }

    keys.add(key);
  }

  return routes;
}

function renderRoutes(routes) {
  const grouped = new Map();

  for (const route of routes) {
    if (!grouped.has(route.context)) {
      grouped.set(route.context, []);
    }

    grouped.get(route.context).push(route);
  }

  const lines = [
    '; SaaS-managed IVR routes',
    '; Managed by the SaaS backend. Do not edit manually.',
    '',
  ];

  for (const context of [...grouped.keys()].sort()) {
    lines.push(`[${context}]`);

    const contextRoutes = grouped.get(context);

    contextRoutes.sort((a, b) =>
      Number(a.extension) - Number(b.extension)
    );

    for (const route of contextRoutes) {
      lines.push(
        `exten => ${route.extension},1,Goto(xivo-ivr-${route.ivrId},s,1)`
      );
    }

    lines.push('');
  }

  return lines.join('\n') + '\n';
}

async function validateOwnership(token, tenant, ivrId) {
  const ivr = await ivrRepo.get(token, tenant, ivrId);

  if (ivr.tenant_uuid !== tenant) {
    throw new HttpError(404, 'IVR not found in this tenant');
  }

  const contextResponse =
    await employeeRepo.listContexts(token, tenant);

  if (
    !Array.isArray(contextResponse?.items) ||
    contextResponse.items.length !== contextResponse.total
  ) {
    throw new HttpError(
      409,
      'Cannot verify complete tenant contexts'
    );
  }

  const internalContexts = contextResponse.items.filter(
    (item) =>
      item.tenant_uuid === tenant &&
      item.type === 'internal' &&
      item.enabled === true
  );

  if (internalContexts.length !== 1) {
    throw new HttpError(
      409,
      'Exactly one enabled internal context is required'
    );
  }

  const context = internalContexts[0];

  if (!CONTEXT_PATTERN.test(context.name)) {
    throw new HttpError(
      409,
      'Unsupported internal context name'
    );
  }

  return { ivr, context };
}

function formatRoute(tenant, route) {
  return {
    tenantUuid: tenant,
    ivrId: route.ivrId,
    extension: route.extension,
    context: route.context,
    destination: `xivo-ivr-${route.ivrId}`,
  };
}

function isActiveDialplan(output, route) {
  const escapedExt = route.extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const extensionLine = new RegExp(
    `'${escapedExt}'\\s*=>\\s*1\\.\\s*Goto\\(xivo-ivr-${route.ivrId},s,1\\)`
  );

  return extensionLine.test(output);
}

function withLock(operation) {
  const task = operationQueue
    .catch(() => {})
    .then(operation);

  operationQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

async function readStoredRoutes() {
  try {
    return parseRoutes(await routeRepo.readConfig());
  } catch (error) {
    console.error('[IVR Routes] Could not read route configuration');
    throw new HttpError(
      503,
      'Persistent IVR route configuration is unavailable or invalid'
    );
  }
}

async function get(tenant, rawIvrId) {
  validateTenant(tenant);

  const ivrId = positiveId(rawIvrId, 'IVR ID');
  const token = await getToken();

  const { context } =
    await validateOwnership(token, tenant, ivrId);

  return withLock(async () => {
    const routes = await readStoredRoutes();

    const matched = routes.filter(
      (route) =>
        route.context === context.name &&
        route.ivrId === ivrId
    );

    const result = [];

    for (const route of matched) {
      const output = await routeRepo.inspectExtension(
        context.name,
        route.extension
      );

      result.push({
        ...formatRoute(tenant, route),
        active: isActiveDialplan(output, route),
      });
    }

    return {
      tenantUuid: tenant,
      ivrId,
      total: result.length,
      items: result,
    };
  });
}

async function create(tenant, rawIvrId, body) {
  validateTenant(tenant);

  const ivrId = positiveId(rawIvrId, 'IVR ID');
  const extension = validateExtension(body?.extension);
  const token = await getToken();

  const { context } =
    await validateOwnership(token, tenant, ivrId);

  return withLock(async () => {
    const before = await routeRepo.readConfig();
    const routes = parseRoutes(before);

    const existing = routes.find(
      (route) =>
        route.context === context.name &&
        route.extension === extension
    );

    if (existing) {
      if (existing.ivrId !== ivrId) {
        throw new HttpError(
          409,
          'This extension belongs to another IVR'
        );
      }

      const output = await routeRepo.inspectExtension(
        context.name,
        extension
      );

      return {
        success: true,
        created: false,
        message: 'Persistent IVR route already exists',
        route: {
          ...formatRoute(tenant, existing),
          active: isActiveDialplan(output, existing),
        },
      };
    }

    // Block collisions with existing Asterisk dialplan
    // entries, including entries not managed by this file.
    const currentDialplan =
      await routeRepo.inspectExtension(
        context.name,
        extension
      );

    if (
      currentDialplan.includes(
        `[ Context '${context.name}'`
      ) &&
      currentDialplan.includes(`'${extension}' =>`)
    ) {
      throw new HttpError(
        409,
        'Extension already exists in the Asterisk dialplan'
      );
    }

    const nextRoute = {
      context: context.name,
      extension,
      ivrId,
    };

    const updated = renderRoutes([...routes, nextRoute]);

    let backup = null;
    let writeAttempted = false;

    try {
      backup = await routeRepo.saveBackup(before);

      writeAttempted = true;
      await routeRepo.writeConfig(updated);
      await routeRepo.reloadDialplan();

      const output = await routeRepo.inspectExtension(
        context.name,
        extension
      );

      if (!isActiveDialplan(output, nextRoute)) {
        throw new Error(
          'Asterisk did not load the expected IVR route'
        );
      }
    } catch (error) {
      if (writeAttempted) {
        try {
          await routeRepo.writeConfig(before);
          await routeRepo.reloadDialplan();
        } catch (rollbackError) {
          console.error('[IVR Routes] Rollback failed', {
            backup,
          });
        }
      }

      console.error('[IVR Routes] Creation failed', {
        tenant,
        ivrId,
        extension,
        backup,
      });

      throw new HttpError(
        502,
        'Persistent IVR route could not be applied. ' +
        'Inspect Asterisk and the backup before retrying.'
      );
    }

    return {
      success: true,
      created: true,
      message: 'Persistent IVR route created',
      route: {
        ...formatRoute(tenant, nextRoute),
        active: true,
      },
    };
  });
}

async function remove(tenant, rawIvrId) {
  validateTenant(tenant);

  const ivrId = positiveId(rawIvrId, 'IVR ID');
  const token = await getToken();

  const { context } =
    await validateOwnership(token, tenant, ivrId);

  return withLock(async () => {
    const before = await routeRepo.readConfig();
    const routes = parseRoutes(before);

    const matching = routes.filter(
      (route) =>
        route.context === context.name &&
        route.ivrId === ivrId
    );

    if (matching.length === 0) {
      return {
        success: true,
        deleted: false,
        message: 'No persistent routes found for this IVR',
      };
    }

    const remaining = routes.filter(
      (route) =>
        !(route.context === context.name &&
          route.ivrId === ivrId)
    );

    let backup = null;
    let writeAttempted = false;

    try {
      backup = await routeRepo.saveBackup(before);

      writeAttempted = true;
      await routeRepo.writeConfig(
        renderRoutes(remaining)
      );

      await routeRepo.reloadDialplan();

      // Check that the removed IVR destination is gone.
      for (const route of matching) {
        const output = await routeRepo.inspectExtension(
          context.name,
          route.extension
        );

        if (isActiveDialplan(output, route)) {
          throw new Error(
            'Removed IVR route is still active'
          );
        }
      }
    } catch (error) {
      if (writeAttempted) {
        try {
          await routeRepo.writeConfig(before);
          await routeRepo.reloadDialplan();
        } catch {
          console.error('[IVR Routes] Delete rollback failed', {
            backup,
          });
        }
      }

      throw new HttpError(
        502,
        'Could not remove the persistent IVR route safely'
      );
    }

    return {
      success: true,
      deleted: true,
      message: 'Persistent IVR routes removed',
      removed: matching.map(
        (route) => formatRoute(tenant, route)
      ),
    };
  });
}

module.exports = {
  get,
  create,
  remove,
};
