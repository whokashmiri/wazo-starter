
const router = require('express').Router();

const controller = require('../controller/sip-trunk.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/sip-trunks',
  asyncHandler(controller.list)
);

router.post(
  '/tenants/:uuid/sip-trunks/local-test',
  asyncHandler(controller.createLocalTest)
);

router.get(
  '/tenants/:uuid/sip-trunks/:id',
  asyncHandler(controller.get)
);

router.post(
  '/tenants/:uuid/sip-trunks/:id/activate',
  asyncHandler(controller.activate)
);

module.exports = router;
