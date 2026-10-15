const client = require('./wazo.client');
async function getToken() {
  const result = await 
  client.request('/api/auth/0.1/token',
     { method: 'POST', basic: true, body: {} });
  const token = 
  result.data?.token || result.token;
  if (!token) 
    throw new 
  Error('Wazo login response did not contain a token');
  return token;
}
module.exports = { getToken };
