const express = require('express');
const controller = require('../controller/tenant.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));

router.post(
  '/:uuid/calling-setup',
  asyncHandler(controller.setupCalling)
);

module.exports = router;