const router = require('express').Router();
const controller = require('../controller/ivr-route.controller');
const wrap = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/authenticate');
const { requireTenantAccess } = require('../middleware/tenant-access');
const { validateRequestOrigin } = require('../middleware/validate-request-origin');

const base = '/tenants/:uuid/ivrs/:ivrId/internal-route';
router.use(authenticate);
router.get(base, requireTenantAccess('COMPANY_ADMIN', 'SUPERVISOR'), wrap(controller.get));
router.post(base, validateRequestOrigin, requireTenantAccess('COMPANY_ADMIN'), wrap(controller.create));
router.delete(base, validateRequestOrigin, requireTenantAccess('COMPANY_ADMIN'), wrap(controller.remove));

module.exports = router;
