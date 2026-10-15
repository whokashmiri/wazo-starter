///integrations/wazo/wazo.client.js

const { Agent, fetch: undiciFetch } = require('undici');
const env = require('../../config/env');
const HttpError = require('../../utils/httpError');
const dispatcher = env.insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
async function request(endpoint, { method='GET', token, tenant, body, basic=false }={}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (basic) {
    if (!env.username || !env.password) throw new HttpError(503, 'Set WAZO_USERNAME and WAZO_PASSWORD in .env');
    headers.Authorization = 'Basic ' + Buffer.from(`${env.username}:${env.password}`).toString('base64');
  }
  if (token) headers['X-Auth-Token'] = token;
  if (tenant) headers['Wazo-Tenant'] = tenant;
  const response = await undiciFetch(env.baseUrl + endpoint, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    dispatcher, signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let result;
  try { result = raw ? JSON.parse(raw) : {}; }
  catch { result = { message: raw.slice(0, 200) }; }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'Wazo authentication or permission denied'
      : `Wazo API returned HTTP ${response.status}`;
    throw new HttpError(response.status, message);
  }
  return result;
}
module.exports = { request };
