const { request } = require('../integrations/wazo/wazo.client');

const API_AUTH = '/api/auth/0.1';
const API_CONFD = '/api/confd/1.1';

module.exports = {
  list(token) {
    return request(`${API_AUTH}/tenants`, { token });
  },

  get(token, tenantUuid) {
    return request(`${API_AUTH}/tenants/${tenantUuid}`, {
      token,
    });
  },

  create(token, name) {
    return request(`${API_AUTH}/tenants`, {
      method: 'POST',
      token,
      body: { name },
    });
  },

  listContexts(token, tenantUuid) {
    return request(`${API_CONFD}/contexts`, {
      token,
      tenant: tenantUuid,
    });
  },

  createContext(token, tenantUuid, data) {
    return request(`${API_CONFD}/contexts`, {
      method: 'POST',
      token,
      tenant: tenantUuid,
      body: {
        ...data,
        tenant_uuid: tenantUuid,
      },
    });
  },
};