//server/controller/whatsapp-webhook.controller.js

const { verifySignature } = require('../utils/wa-security');

function createWebhookController(prisma) {
  function verify(req, res) {
    const mode = req.query['hub.mode'];
    const verifyToken = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && verifyToken && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge !== undefined) {
      return res.status(200).type('text/plain').send(String(challenge));
    }
    return res.sendStatus(403);
  }
  async function receive(req, res) {
    if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.get('x-hub-signature-256'))) return res.sendStatus(403);
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    if (event.object !== 'whatsapp_business_account') return res.sendStatus(200);
    try {
      for (const entry of event.entry || []) for (const change of entry.changes || []) {
        const value = change.value || {};
        const id = value.metadata?.phone_number_id;
        if (!id) continue;
        const channel = await prisma.waChannel.findUnique({ where: { phoneNumberId: String(id) } });
        if (!channel?.enabled) continue;
        for (const message of value.messages || []) {
          if (!message.id || !message.from) continue;
          const text = message.text?.body || message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || null;
          // Do not silently forward unsupported media; retain metadata for future handling.
          await prisma.waInbound.upsert({
            where: { channelId_providerMessageId: { channelId: channel.id, providerMessageId: message.id } },
            update: {},
            create: { channelId: channel.id, providerMessageId: message.id, senderPhone: message.from,
              messageText: text, payload: message },
          });
        }
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp webhook storage failed:', error.message);
      return res.sendStatus(500); // Meta can retry; message ids are unique
    }
  }
  return { verify, receive };
}
module.exports = { createWebhookController };
