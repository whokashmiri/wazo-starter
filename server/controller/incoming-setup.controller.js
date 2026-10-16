
const service = require('../service/incoming-setup.service');

module.exports = {
  async get(req, res) {
    res.json(
      await service.get(req.params.uuid)
    );
  },

  async create(req, res) {
    const result = await service.create(
      req.params.uuid
    );

    res.status(result.created ? 201 : 200).json(result);
  },
};
