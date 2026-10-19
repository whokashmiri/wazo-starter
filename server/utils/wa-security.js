const crypto = require('node:crypto');

function encryptedToken(plaintext) {
  const key = Buffer.from(process.env.WA_TOKEN_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32) throw new Error('WA_TOKEN_ENCRYPTION_KEY must be 32 bytes hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { tokenCiphertext: ciphertext.toString('base64'), tokenIv: iv.toString('base64'), tokenTag: cipher.getAuthTag().toString('base64') };
}
function decryptedToken(channel) {
  const key = Buffer.from(process.env.WA_TOKEN_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32) throw new Error('WA_TOKEN_ENCRYPTION_KEY must be 32 bytes hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(channel.tokenIv, 'base64'));
  decipher.setAuthTag(Buffer.from(channel.tokenTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(channel.tokenCiphertext, 'base64')), decipher.final()]).toString('utf8');
}
function verifySignature(raw, signature) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(signature.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const phone = (value) => {
  const normalized = String(value || '').replace(/^\+/, '').replace(/[\s()-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(normalized)) throw new Error('Use international phone format without +');
  return normalized;
};
module.exports = { encryptedToken, decryptedToken, verifySignature, phone };
