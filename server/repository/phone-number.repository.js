
const { request } = require('../integrations/wazo/wazo.client');

const BASE = '/api/confd/1.1';

function api(token, tenant, endpoint, method = 'GET', body) {
  return request(`${BASE}${endpoint}`, {
    method,
    token,
    tenant,
    ...(body === undefined ? {} : { body }),
  });
}

module.exports = {
  listContexts(token, tenant) {
    return api(token, tenant, '/contexts?limit=10000');
  },

  getContext(token, tenant, id) {
    return api(token, tenant, `/contexts/${id}`);
  },

  updateContext(token, tenant, id, body) {
    return api(token, tenant, `/contexts/${id}`, 'PUT', body);
  },

  listExtensions(token, tenant) {
    return api(token, tenant, '/extensions?limit=10000');
  },

  createExtension(token, tenant, body) {
    return api(token, tenant, '/extensions', 'POST', body);
  },

  listIncalls(token, tenant) {
    return api(token, tenant, '/incalls?limit=10000');
  },

  getIncall(token, tenant, id) {
    return api(token, tenant, `/incalls/${id}`);
  },

  createIncall(token, tenant, body) {
    return api(token, tenant, '/incalls', 'POST', body);
  },

  associate(token, tenant, incallId, extensionId) {
    return api(
      token,
      tenant,
      `/incalls/${incallId}/extensions/${extensionId}`,
      'PUT',
      {}
    );
  },

  getIvr(token, tenant, id) {
    return api(token, tenant, `/ivr/${id}`);
  },
};
