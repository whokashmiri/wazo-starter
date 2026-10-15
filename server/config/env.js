require('dotenv').config();
const BASE = (process.env.WAZO_URL || 'https://localhost:8443').replace(/\/$/, '');
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error('Local starter only: WAZO_URL must be localhost over HTTPS');
}
module.exports = {
  port: Number(process.env.PORT || 3100),
  baseUrl: BASE,
  username: process.env.WAZO_USERNAME,
  password: process.env.WAZO_PASSWORD,
  insecureTls: process.env.WAZO_DEV_INSECURE_TLS === 'true',
};
