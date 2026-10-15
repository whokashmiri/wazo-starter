
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const ffmpeg = require('ffmpeg-static');
const { validateTenant } = require('../models/employee.model');
const HttpError = require('../utils/httpError');

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DURATION_SECONDS = 120;

const WAZO_SOUND_ROOT = '/var/lib/wazo/sounds';

const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac',
  '.ogg', '.oga', '.flac', '.opus',
  '.wma', '.webm',
]);

function dockerCommand() {
  return process.platform === 'win32'
    ? 'docker.exe'
    : 'docker';
}

function dockerOptions() {
  const composeDir = process.env.WAZO_DOCKER_COMPOSE_DIR;

  if (!composeDir || !path.isAbsolute(composeDir)) {
    throw new HttpError(
      503,
      'WAZO_DOCKER_COMPOSE_DIR is not configured'
    );
  }

  return {
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
  };
}

async function runDocker(args) {
  const options = dockerOptions();

  return execFileAsync(
    dockerCommand(),
    args,
    options,
  );
}

async function convertToWav(inputPath, outputPath) {
  if (!ffmpeg) {
    throw new HttpError(
      503,
      'FFmpeg executable is unavailable'
    );
  }

  await execFileAsync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-y',

      '-i', inputPath,

      '-map', '0:a:0',
      '-vn',

      // Keep prompts to at most two minutes.
      '-t', String(MAX_DURATION_SECONDS),

      // Asterisk-compatible telephony format.
      '-ac', '1',
      '-ar', '8000',
      '-c:a', 'pcm_s16le',

      '-f', 'wav',
      outputPath,
    ],
    {
      timeout: 45000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    },
  );

  const stats = await fs.stat(outputPath);

  if (stats.size <= 44) {
    throw new Error('Converted audio is empty');
  }

  // Approximate upper bound for 2 minutes of mono
  // 8 kHz / 16-bit uncompressed audio.
  if (stats.size > 2_100_000) {
    throw new Error('Converted audio exceeds allowed size');
  }
}

async function uploadIvrAudio(tenant, file) {
  validateTenant(tenant);

  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new HttpError(
      400,
      'An audio file is required'
    );
  }

  if (
    file.buffer.length === 0 ||
    file.buffer.length > MAX_UPLOAD_BYTES
  ) {
    throw new HttpError(
      400,
      'Audio file must be between 1 byte and 10 MB'
    );
  }

  const ext = path.extname(
    file.originalname || ''
  ).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpError(
      400,
      'Unsupported audio file extension'
    );
  }

  const audioId = crypto.randomUUID();
  const filename = `ivr-${audioId}`;

  const tenantDir =
    `${WAZO_SOUND_ROOT}/tenants/${tenant}/playback`;

  const remoteFile = `${tenantDir}/${filename}.wav`;

  // Asterisk Playback and Wazo menu_sound references
  // omit the audio extension.
  const menuSound = `${tenantDir}/${filename}`;

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'wazo-ivr-')
  );

  const inputPath = path.join(
    tempDir,
    `source${ext}`
  );

  const outputPath = path.join(
    tempDir,
    `${filename}.wav`
  );

  try {
    await fs.writeFile(inputPath, file.buffer);

    await convertToWav(inputPath, outputPath);

    // In your local Wazo Docker setup, confd and
    // asterisk share the persistent wazo-sounds volume.
    //
    // Validate the environment before using this on
    // any other deployment.

    await runDocker([
      'compose',
      'exec',
      '-T',
      'confd',
      'mkdir',
      '-p',
      tenantDir,
    ]);

    // Copy the converted WAV into the persistent volume.
    await runDocker([
      'compose',
      'cp',
      outputPath,
      `confd:${remoteFile}`,
    ]);

    // Verify the file is present and readable in confd.
    await runDocker([
      'compose',
      'exec',
      '-T',
      'confd',
      'test',
      '-s',
      remoteFile,
    ]);

    return {
      success: true,
      audioId,
      tenantUuid: tenant,
      originalName: file.originalname,
      format: {
        container: 'wav',
        codec: 'pcm_s16le',
        sampleRate: 8000,
        channels: 1,
      },
      menuSound,
    };
  } catch (error) {
    console.error('[IVR Audio Upload]', {
      tenant,
      audioId,
      errorCode: error.code || null,
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      502,
      'IVR audio conversion or storage failed'
    );
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

module.exports = {
  uploadIvrAudio,
};
