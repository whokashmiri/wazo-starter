
const prisma = require('../config/prisma');
const HttpError = require('../utils/httpError');

function requiredText(value, field, min, max) {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`);
  }

  const text = value.trim();

  if (text.length < min || text.length > max) {
    throw new HttpError(
      400,
      `${field} must be between ${min} and ${max} characters`
    );
  }

  return text;
}

function optionalText(value, field, max) {
  if (value == null || value === '') return null;

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be text`);
  }

  const text = value.trim();

  if (text.length > max) {
    throw new HttpError(
      400,
      `${field} must not exceed ${max} characters`
    );
  }

  return text || null;
}

async function applyForCompany(userId, input = {}) {
  if (!userId) {
    throw new HttpError(401, 'Authentication required');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      platformRole: true,
      emailVerifiedAt: true,
    },
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, 'Invalid account');
  }

  if (user.platformRole === 'PLATFORM_ADMIN') {
    throw new HttpError(
      403,
      'Use platform administration to manage companies'
    );
  }

  // Enable after implementing email verification.
  // Do not claim email is verified until that flow exists.
  //
  // if (!user.emailVerifiedAt) {
  //   throw new HttpError(403, 'Verify your email first');
  // }

  const name = requiredText(
    input.name,
    'Company name',
    2,
    80
  );

  const email = optionalText(
    input.email,
    'Company email',
    254
  );

  const phone = optionalText(
    input.phone,
    'Company phone',
    30
  );

  // First release: one company application per customer.
  // Revisit this rule when multi-company ownership is needed.
  const existing = await prisma.organization.findFirst({
    where: { requestedById: userId },
    select: { id: true, status: true },
  });

  if (existing) {
    throw new HttpError(
      409,
      'You already have a company application'
    );
  }

  const organization = await prisma.organization.create({
    data: {
      name,
      email,
      phone,
      country: 'SA',
      status: 'PENDING',
      requestedById: userId,

      // Create company ownership in SaaS,
      // without creating a Wazo tenant yet.
      memberships: {
        create: {
          userId,
          role: 'COMPANY_ADMIN',
        },
      },
    },

    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      country: true,
      status: true,
      wazoTenantUuid: true,
      createdAt: true,
    },
  });

  return organization;
}

async function getMyCompanies(userId) {
  if (!userId) {
    throw new HttpError(401, 'Authentication required');
  }

  return prisma.organization.findMany({
    where: {
      memberships: {
        some: { userId },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      wazoTenantUuid: true,
      createdAt: true,
      memberships: {
        where: { userId },
        select: { role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  applyForCompany,
  getMyCompanies,
};
