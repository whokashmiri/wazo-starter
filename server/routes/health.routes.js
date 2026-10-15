const router = require('express').Router();
const ctrl = require('../controller/health.controller');
const wrap = require('../utils/asyncHandler');
router.get('/health', wrap(ctrl.check));
module.exports = router;
