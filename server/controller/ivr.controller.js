
const service = require('../service/ivr.service');

module.exports = {
  async list(req, res) {
    res.json(await service.list(req.params.uuid));
  },

  async get(req, res) {
    res.json(
      await service.get(req.params.uuid, req.params.ivrId)
    );
  },

  async create(req, res) {
    const result = await service.create(
      req.params.uuid,
      req.body
    );

    res.status(201).json(result);
  },
};
