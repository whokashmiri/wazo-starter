
const router = require('express').Router();
const ctrl = require('../controller/employee.controller');
const wrap = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/users',
  wrap(ctrl.list),
);

router.post(
  '/tenants/:uuid/users',
  wrap(ctrl.create),
);

router.get(
  '/tenants/:uuid/calling-setup',
  wrap(ctrl.callingSetup),
);

router.post(
  '/tenants/:uuid/users/:userId/phone-setup/preview',
  wrap(ctrl.previewPhoneSetup),
);

router.post(
  '/tenants/:uuid/users/:userId/phone-setup',
  wrap(ctrl.provisionPhone),
);

module.exports = router;
