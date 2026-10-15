
const { request } = require('../integrations/wazo/wazo.client');

const API = '/api/confd/1.1';

const scoped = (token, tenant) => ({ token, tenant });

module.exports = {
  listUsers: (token, tenant) =>
    request(`${API}/users`, scoped(token, tenant)),

  getUser: (token, tenant, userId) =>
    request(`${API}/users/${userId}`, scoped(token, tenant)),

  createUser: (token, tenant, employee) =>
    request(`${API}/users`, {
      method: 'POST',
      token,
      tenant,
      body: { ...employee, tenant_uuid: tenant },
    }),

  listContexts: (token, tenant) =>
    request(`${API}/contexts?limit=1000`, scoped(token, tenant)),

  listExtensions: (token, tenant) =>
    request(`${API}/extensions?limit=1000`, scoped(token, tenant)),

  listLines: (token, tenant) =>
    request(`${API}/lines?limit=1000`, scoped(token, tenant)),

  getLine: (token, tenant, lineId) =>
    request(`${API}/lines/${lineId}`, scoped(token, tenant)),

  getExtension: (token, tenant, extensionId) =>
    request(`${API}/extensions/${extensionId}`, scoped(token, tenant)),

  getSipEndpoint: (token, tenant, endpointId) =>
    request(
      `${API}/endpoints/sip/${endpointId}`,
      scoped(token, tenant),
    ),

  createSipEndpoint: (token, tenant, body) =>
    request(`${API}/endpoints/sip`, {
      method: 'POST',
      token,
      tenant,
      body: { ...body, tenant_uuid: tenant },
    }),

  createLine: (token, tenant, contextName) =>
    request(`${API}/lines`, {
      method: 'POST',
      token,
      tenant,
      body: {
        context: contextName,
        tenant_uuid: tenant,
      },
    }),

  createExtension: (token, tenant, extension, contextName) =>
    request(`${API}/extensions`, {
      method: 'POST',
      token,
      tenant,
      body: {
        exten: extension,
        context: contextName,
        tenant_uuid: tenant,
      },
    }),

  associateLineEndpoint: (token, tenant, lineId, endpointId) =>
    request(`${API}/lines/${lineId}/endpoints/sip/${endpointId}`, {
      method: 'PUT',
      token,
      tenant,
    }),

  associateLineExtension: (token, tenant, lineId, extensionId) =>
    request(`${API}/lines/${lineId}/extensions/${extensionId}`, {
      method: 'PUT',
      token,
      tenant,
    }),

  associateUserLine: (token, tenant, userId, lineId) =>
    request(`${API}/users/${userId}/lines/${lineId}`, {
      method: 'PUT',
      token,
      tenant,
    }),

  deleteLine: (token, tenant, lineId) =>
    request(`${API}/lines/${lineId}`, {
      method: 'DELETE',
      token,
      tenant,
    }),

  deleteExtension: (token, tenant, extensionId) =>
    request(`${API}/extensions/${extensionId}`, {
      method: 'DELETE',
      token,
      tenant,
    }),

  deleteSipEndpoint: (token, tenant, endpointId) =>
    request(`${API}/endpoints/sip/${endpointId}`, {
      method: 'DELETE',
      token,
      tenant,
    }),
};
