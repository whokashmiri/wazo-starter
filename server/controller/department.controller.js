
const service = require('../service/department.service');

module.exports = {
  async list(req, res) {
    const result = await service.list(req.params.uuid);
    res.json(result);
  },

  async get(req, res) {
    const result = await service.get(
      req.params.uuid,
      req.params.queueId,
    );

    res.json(result);
  },

  async addMember(req, res) {
  const result = await service.addMember(
    req.params.uuid,
    req.params.queueId,
    req.body,
  );

  res.status(result.created ? 201 : 200).json(result);
},

  async create(req, res) {
    const result = await service.create(
      req.params.uuid,
      req.body,
    );

    res.status(201).json(result);
  },

  async setupExtension(req, res) {
  const result = await service.setupQueueExtension(
    req.params.uuid,
    req.params.queueId,
    req.body
  );

  res.status(result.created ? 201 : 200).json(result);
},
};
