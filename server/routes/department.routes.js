
const router = require('express').Router();

const controller = require('../controller/department.controller');
const wrap = require('../utils/asyncHandler');

router.get(
  '/tenants/:uuid/departments',
  wrap(controller.list),
);

router.get(
  '/tenants/:uuid/departments/:queueId',
  wrap(controller.get),
);

router.post(
  '/tenants/:uuid/departments',
  wrap(controller.create),
);

router.post(
  '/tenants/:uuid/departments/:queueId/members',
  wrap(controller.addMember),
);

router.post(
  '/tenants/:uuid/departments/:queueId/extension',
  wrap(controller.setupExtension)
);

module.exports = router;
