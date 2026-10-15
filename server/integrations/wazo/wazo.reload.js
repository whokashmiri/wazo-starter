
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileAsync = promisify(execFile);

// Serialize reloads within this Node.js process.
let reloadQueue = Promise.resolve();

function reloadAsterisk() {
  if (process.env.WAZO_AUTO_RELOAD !== 'true') {
    return Promise.resolve({
      applied: false,
      status: 'disabled',
    });
  }

  const composeDir = process.env.WAZO_DOCKER_COMPOSE_DIR;

  if (!composeDir || !path.isAbsolute(composeDir)) {
    return Promise.resolve({
      applied: false,
      status: 'misconfigured',
    });
  }

  const task = reloadQueue
    .catch(() => {})
    .then(async () => {
      // Arguments are fixed by the backend, never user-supplied.
      const command =
        "wazo-confgen asterisk/pjsip.conf --invalidate " +
        "&& asterisk -rx 'core reload'";

      try {
        await execFileAsync(
          process.platform === 'win32' ? 'docker.exe' : 'docker',
          [
            'compose',
            'exec',
            '-T',
            'asterisk',
            'bash',
            '-lc',
            command,
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

        return {
          applied: true,
          status: 'reloaded',
        };
      } catch (error) {
        console.error('[Asterisk Reload]', {
          code: error.code || null,
          message: String(error.message || '').slice(0, 250),
        });

        return {
          applied: false,
          status: 'reload_failed',
        };
      }
    });

  reloadQueue = task.then(() => undefined, () => undefined);

  return task;
}

module.exports = {
  reloadAsterisk,
};
