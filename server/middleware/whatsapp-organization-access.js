const prisma = require('../config/prisma');
// Returns 404 for missing organization and 403 for non-admin membership.
async function requireCompanyAdmin(req, res, next) {
  try {
    // Existing authenticate middleware must provide req.user.id. Fail closed.
    const userId = req.user?.id;
    const organizationId = req.params.organizationId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: { select: { status: true } } },
    });
    if (!membership || membership.role !== 'COMPANY_ADMIN') return res.sendStatus(403);
    if (membership.organization.status !== 'ACTIVE') return res.status(409).json({ error: 'Organization is not active' });
    return next();
  } catch (err) { return next(err); }
}
module.exports = requireCompanyAdmin;
