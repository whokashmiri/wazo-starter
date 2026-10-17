
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function getPaths() {
  const composeDir = process.env.WAZO_DOCKER_COMPOSE_DIR;

  if (!composeDir || !path.isAbsolute(composeDir)) {
    throw new Error('WAZO_DOCKER_COMPOSE_DIR is invalid');
  }

  return {
    composeDir,
    file: path.join(composeDir, 'etc', 'saas-ivr-routes.conf'),
  };
}

async function readConfig() {
  const { file } = getPaths();

  return fs.readFile(file, 'utf8');
}

// Preserve the mounted file's identity: write into the
// existing file instead of replacing it with rename().
async function writeConfig(content) {
  const { file } = getPaths();

  const handle = await fs.open(file, 'r+');

  try {
    await handle.truncate(0);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function saveBackup(content) {
  const { file } = getPaths();

  const backup = `${file}.${Date.now()}.bak`;
  await fs.writeFile(backup, content, {
    encoding: 'utf8',
    flag: 'wx',
  });

  return backup;
}

async function asterisk(command) {
  const { composeDir } = getPaths();

  return execFileAsync(
    process.platform === 'win32' ? 'docker.exe' : 'docker',
    [
      'compose', 'exec', '-T', 'asterisk',
      'asterisk', '-rx', command,
    ],
    {
      cwd: composeDir,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        LOCAL_GIT_REPOS:
          process.env.LOCAL_GIT_REPOS ||
          path.dirname(composeDir),
      },
    },
  );
}

async function reloadDialplan() {
  return asterisk('dialplan reload');
}


async function inspectExtension(context, extension) {
  try {
    const { stdout } = await asterisk(
      `dialplan show ${extension}@${context}`
    );

    return stdout;
  } catch (error) {
    const output = [
      error.stdout || '',
      error.stderr || '',
    ].join('\n');

    if (
      output.includes('There is no existence of') ||
      output.includes('not found in context')
    ) {
      return output;
    }

    throw error;
  }
}


module.exports = {
  readConfig,
  writeConfig,
  saveBackup,
  reloadDialplan,
  inspectExtension,
};
