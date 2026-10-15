const service = require('../service/tenant.service');

module.exports = {
  async list(req, res) {
    res.json(await service.list());
  },

  async create(req, res) {
    const result = await service.create(req.body?.name);
    res.status(201).json(result);
  },

  async setupCalling(req, res) {
    const result = await service.setupCalling(req.params.uuid);

    res.status(result.created ? 201 : 200).json(result);
  },
};