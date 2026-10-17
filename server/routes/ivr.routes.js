
const router = require('express').Router();

const controller = require('../controller/ivr.controller');
const wrap = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/ivrs',
  wrap(controller.list)
);

router.get(
  '/tenants/:uuid/ivrs/:ivrId',
  wrap(controller.get)
);

router.post(
  '/tenants/:uuid/ivrs',
  wrap(controller.create)
);

module.exports = router;
