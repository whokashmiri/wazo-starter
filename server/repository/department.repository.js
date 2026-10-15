
const { request } = require('../integrations/wazo/wazo.client');

const API = '/api/confd/1.1';

module.exports = {
  list(token, tenant, offset = 0, limit = 100) {
    return request(
      `${API}/queues?offset=${offset}&limit=${limit}`,
      { token, tenant },
    );
  },

  get(token, tenant, queueId) {
    return request(`${API}/queues/${queueId}`, {
      token,
      tenant,
    });
  },

  addUserMember(token, tenant, queueId, userId, priority = 1) {
  return request(
    `${API}/queues/${queueId}/members/users/${userId}`,
    {
      method: 'PUT',
      token,
      tenant,
      body: { priority },
    },
  );
},

  create(token, tenant, payload) {
    return request(`${API}/queues`, {
      method: 'POST',
      token,
      tenant,
      body: payload,
    });
  },



getContext(token, tenant, contextId) {
  return request(
    `${API}/contexts/${contextId}`,
    { token, tenant }
  );
},

updateContext(token, tenant, contextId, data) {
  return request(
    `${API}/contexts/${contextId}`,
    {
      method: 'PUT',
      token,
      tenant,
      body: data,
    }
  );
},

listExtensions(token, tenant, offset = 0, limit = 100) {
  return request(
    `${API}/extensions?offset=${offset}&limit=${limit}`,
    { token, tenant }
  );
},

createExtension(token, tenant, extension, contextName) {
  return request(`${API}/extensions`, {
    method: 'POST',
    token,
    tenant,
    body: {
      exten: extension,
      context: contextName,
      tenant_uuid: tenant,
    },
  });
},

associateQueueExtension(token, tenant, queueId, extensionId) {
  return request(
    `${API}/queues/${queueId}/extensions/${extensionId}`,
    {
      method: 'PUT',
      token,
      tenant,
    }
  );
},





};
