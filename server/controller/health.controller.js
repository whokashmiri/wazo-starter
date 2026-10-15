

const { getToken } = require('../integrations/wazo/wazo.auth');
const tenantRepo = require('../repository/tenant.repository');
const unwrap = (x) => x.items ?? x.data?.items ?? x.data ?? x;
module.exports = {
  async check(req, res) {
    const token = await getToken();
    const data = unwrap(await tenantRepo.list(token));
    res.json({ ok: true, service: 'Wazo auth', tenantsVisible: Array.isArray(data) ? data.length : null });
  },
};
