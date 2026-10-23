const { processInbound } = require('../service/whatsapp-routing.service');
function startWhatsAppWorker(prisma, { intervalMs = 3000 } = {}) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const rows = await prisma.waInbound.findMany({ where: { status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { lte: new Date() }, attempts: { lt: 6 } },
        orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        const lock = await prisma.waInbound.updateMany({ where: { id: row.id, status: { in: ['PENDING','FAILED'] } },
          data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: new Date() } });
        if (!lock.count) continue;
        try {
          await processInbound(prisma, row);
          await prisma.waInbound.update({ where: { id: row.id }, data: { status: 'DONE', error: null } });
        } catch (err) {
          console.error('WhatsApp job failed:', row.id, err.message);
          const delay = Math.min(900, 5 * Math.pow(2, row.attempts)) * 1000;
          await prisma.waInbound.update({ where: { id: row.id }, data: { status: 'FAILED', error: err.message.slice(0, 1000), nextAttemptAt: new Date(Date.now() + delay) } });
        }
      }
    } catch (err) { console.error('WhatsApp worker:', err.message); }
    finally { running = false; }
  };
  // Recover abandoned work after a crash. Requires a single worker or external lease coordinator.
  prisma.waInbound.updateMany({ where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } }, data: { status: 'FAILED' } })
    .catch(err => console.error('WhatsApp recovery:', err.message));
  const timer = setInterval(tick, intervalMs);
  tick();
  return () => { stopped = true; clearInterval(timer); };
}
module.exports = { startWhatsAppWorker };
