
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DID_RE = /^\d{1,32}$/;
const CONTEXT_RE = /^[A-Za-z0-9_-]+$/;
const TENANT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getComposeDir() {
  const dir = process.env.WAZO_DOCKER_COMPOSE_DIR;

  if (!dir || !path.isAbsolute(dir)) {
    throw new Error(
      'WAZO_DOCKER_COMPOSE_DIR must be an absolute path'
    );
  }

  return dir;
}

async function dockerExec(args, timeout = 45000) {
  const composeDir = getComposeDir();

  const { stdout, stderr } = await execFileAsync(
    process.platform === 'win32'
      ? 'docker.exe'
      : 'docker',
    ['compose', 'exec', '-T', 'asterisk', ...args],
    {
      cwd: composeDir,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        LOCAL_GIT_REPOS:
          process.env.LOCAL_GIT_REPOS ||
          path.dirname(composeDir),
      },
    }
  );

  return {
    stdout: stdout || '',
    stderr: stderr || '',
  };
}

async function regenerateAndReload() {
  // Commands are fixed: no user input is inserted
  // into a shell command.
  const result = await dockerExec(
    [
      'bash',
      '-lc',
      "wazo-confgen asterisk/extensions.conf --invalidate && asterisk -rx 'dialplan reload'",
    ],
    60000
  );

  if (
    /dialplan reload failed|error reloading/i.test(
      result.stdout + result.stderr
    )
  ) {
    throw new Error('Asterisk dialplan reload failed');
  }

  return result;
}

async function inspectDialplan(context, did) {
  if (
    !CONTEXT_RE.test(context) ||
    !DID_RE.test(String(did))
  ) {
    throw new Error('Invalid dialplan lookup arguments');
  }

  return dockerExec([
    'asterisk',
    '-rx',
    `dialplan show ${did}@${context}`,
  ]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifyOutput({
  output,
  tenantUuid,
  context,
  did,
  incallId,
}) {
  const route = new RegExp(
    `'${escapeRegex(did)}'\\s*=>\\s*1\\.`
  );

  const incall = new RegExp(
    `GoSub\\(did,s,1\\(${incallId},`
  );

  return (
    output.includes(`[ Context '${context}'`) &&
    route.test(output) &&
    output.includes(
      `Set(__WAZO_TENANT_UUID=${tenantUuid})`
    ) &&
    incall.test(output)
  );
}

// A single-process lock prevents concurrent regenerate/reload
// operations from overlapping in this local deployment.
let activationQueue = Promise.resolve();

function serialized(operation) {
  const task = activationQueue
    .catch(() => {})
    .then(operation);

  activationQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

async function activateDid({
  tenantUuid,
  context,
  did,
  incallId,
}) {
  if (
    !TENANT_RE.test(tenantUuid) ||
    !CONTEXT_RE.test(context) ||
    !DID_RE.test(String(did)) ||
    !Number.isSafeInteger(incallId) ||
    incallId <= 0
  ) {
    throw new Error('Invalid DID activation parameters');
  }

  return serialized(async () => {
    const reload = await regenerateAndReload();

    const dialplan = await inspectDialplan(
      context,
      did
    );

    const output = dialplan.stdout + dialplan.stderr;

    if (!verifyOutput({
      output,
      tenantUuid,
      context,
      did: String(did),
      incallId,
    })) {
      throw new Error(
        'Asterisk did not load the expected tenant DID route'
      );
    }

    return {
      applied: true,
      verified: true,
      status: 'active',
      did: String(did),
      incallId,
      context,
      tenantUuid,
      checkedAt: new Date().toISOString(),
      reloadOutput: reload.stdout.trim(),
    };
  });
}

module.exports = {
  activateDid,
  inspectDialplan,
};
