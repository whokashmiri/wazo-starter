
const router = require('express').Router();

const controller = require('../controller/incoming-setup.controller');
const wrap = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/incoming-setup',
  wrap(controller.get)
);

router.post(
  '/tenants/:uuid/incoming-setup',
  wrap(controller.create)
);

module.exports = router;
