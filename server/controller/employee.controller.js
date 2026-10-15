
const service = require('../service/employee.service');
const phoneService = require('../service/phone-provisioning.service');

module.exports = {
  async list(req, res) {
    res.json(await service.listUsers(req.params.uuid));
  },

  async create(req, res) {
    const result = await service.createUser(
      req.params.uuid,
      req.body,
    );
    res.status(201).json(result);
  },

  async callingSetup(req, res) {
    res.json(await service.getCallingSetup(req.params.uuid));
  },

  async previewPhoneSetup(req, res) {
    res.json(await service.previewPhoneSetup(
      req.params.uuid,
      req.params.userId,
      req.body,
    ));
  },

  async provisionPhone(req, res) {
    const result = await phoneService.provisionPhone(
      req.params.uuid,
      req.params.userId,
      req.body,
    );
    res.status(201).json(result);
  },
};
