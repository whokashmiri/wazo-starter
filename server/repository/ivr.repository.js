const { request } = require('../integrations/wazo/wazo.client');

const API = '/api/confd/1.1';

module.exports = {
  list(token, tenant, offset = 0, limit = 100) {
    return request(
      `${API}/ivr?offset=${offset}&limit=${limit}`,
      { token, tenant }
    );
  },

  get(token, tenant, ivrId) {
    return request(`${API}/ivr/${ivrId}`, {
      token,
      tenant,
    });
  },

  create(token, tenant, body) {
    return request(`${API}/ivr`, {
      method: 'POST',
      token,
      tenant,
      body,
    });
  },

  update(token, tenant, ivrId, body) {
    return request(`${API}/ivr/${ivrId}`, {
      method: 'PUT',
      token,
      tenant,
      body,
    });
  },

  getQueue(token, tenant, queueId) {
    return request(`${API}/queues/${queueId}`, {
      token,
      tenant,
    });
  },
};