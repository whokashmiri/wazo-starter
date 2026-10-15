
const router = require('express').Router();
const controller = require('../controller/phone-number.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/phone-numbers',
  asyncHandler(controller.list)
);

router.post(
  '/tenants/:uuid/phone-numbers',
  asyncHandler(controller.create)
);

router.get(
  '/tenants/:uuid/phone-numbers/:id',
  asyncHandler(controller.get)
);

router.post(
  '/tenants/:uuid/phone-numbers/:id/activate',
  asyncHandler(controller.activate)
);

module.exports = router;
