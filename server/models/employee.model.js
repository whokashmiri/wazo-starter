const HttpError = require('../utils/httpError');
function validateTenant(uuid) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid || '')) {
    throw new HttpError(400, 'Valid tenant UUID is required');
  }
  return uuid;
}
function validateEmployee(body) {
  const firstname = typeof body?.firstname === 'string' ? body.firstname.trim() : '';
  const lastname = typeof body?.lastname === 'string' ? body.lastname.trim() : '';
  if (!firstname || firstname.length > 60 || lastname.length > 60) {
    throw new HttpError(400, 'First name is required; max 60 characters per name');
  }
  return { firstname, lastname };
}
module.exports = { validateTenant, validateEmployee };
