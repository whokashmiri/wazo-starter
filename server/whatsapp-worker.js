'use strict';
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
const prisma = require('./config/prisma');
const { startWhatsAppWorker } = require('./workers/whatsapp.worker');
console.log('[WhatsApp] Worker started; checking pending inbound messages');
const stop = startWhatsAppWorker(prisma);
async function shutdown() { stop(); await prisma.$disconnect(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
