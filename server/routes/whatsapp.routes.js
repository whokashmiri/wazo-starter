'use strict';
const express = require('express');
const prisma = require('../config/prisma');
const { createWebhookController } = require('../controller/whatsapp-webhook.controller');
const admin = require('../controller/whatsapp-admin.controller');
const requireCompanyAdmin = require('../middleware/whatsapp-organization-access');

function mountWhatsAppWebhook(app) {
  const webhook = createWebhookController(prisma);
  app.get('/api/whatsapp/webhook', webhook.verify);
  app.post('/api/whatsapp/webhook', express.raw({ type: 'application/json', limit: '512kb' }), webhook.receive);
}
function mountWhatsAppAdmin(app, authenticate) {
  if (typeof authenticate !== 'function') throw new Error('authenticate function required');
  const router = express.Router({ mergeParams: true });
  router.use(authenticate, requireCompanyAdmin);
  router.get('/', admin.list);
  router.post('/connect', admin.connect);
  router.post('/department', admin.addDepartment);
  router.post('/member', admin.addMember);
  app.use('/api/organizations/:organizationId/whatsapp', router);
}
module.exports = { mountWhatsAppWebhook, mountWhatsAppAdmin };
