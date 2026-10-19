
const service = require('../service/ivr-route.service');

module.exports = {
  async get(req, res) {
    res.json(await service.get(
      req.params.uuid,
      req.params.ivrId
    ));
  },

  async create(req, res) {
    const result = await service.create(
      req.params.uuid,
      req.params.ivrId,
      req.body
    );

    res.status(result.created ? 201 : 200).json(result);
  },

  async remove(req, res) {
    res.json(await service.remove(
      req.params.uuid,
      req.params.ivrId
    ));
  },
};
