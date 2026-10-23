
const prisma = require('../config/prisma');
const tenantService = require('./tenant.service');
const incomingSetupService = require('./incoming-setup.service');
const HttpError = require('../utils/httpError');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set([
  'PENDING',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'FAILED_PROVISIONING',
]);

function validateCompanyId(id) {
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw new HttpError(400, 'Valid company ID is required');
  }

  return id;
}

async function listCompanies(status) {
  if (status && !VALID_STATUSES.has(status)) {
    throw new HttpError(400, 'Invalid company status');
  }

  return prisma.organization.findMany({
    where: status ? { status } : {},
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      country: true,
      status: true,
      wazoTenantUuid: true,
      createdAt: true,
      reviewedAt: true,
      rejectionReason: true,
      provisioningError: true,
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      memberships: {
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isActive: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function approveCompany(companyId, adminId) {
  validateCompanyId(companyId);

  // Database conditional update prevents two admins from
  // starting provisioning for the same company.
  const reserved = await prisma.organization.updateMany({
    where: {
      id: companyId,
      status: 'PENDING',
      wazoTenantUuid: null,
    },
    data: {
      status: 'PROVISIONING',
      reviewedById: adminId,
      reviewedAt: new Date(),
      rejectionReason: null,
      provisioningError: null,
      provisioningStartedAt: new Date(),
    },
  });

  if (reserved.count !== 1) {
    throw new HttpError(
      409,
      'Company is not pending or provisioning has already started'
    );
  }

  let tenantUuid = null;
  let createAttempted = false;

  try {
    const company = await prisma.organization.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true },
    });

    // Wazo is a separate system from PostgreSQL.
    createAttempted = true;

    const tenant = await tenantService.create(company.name);

    // tenant.repository.create() returns the Wazo HTTP
    // client's result. Verify that it is the tenant object.
    tenantUuid = tenant?.uuid;

    if (!tenantUuid || !UUID_REGEX.test(tenantUuid)) {
      throw new Error(
        'Wazo tenant creation returned no valid UUID. ' +
        'Inspect Wazo before any provisioning retry.'
      );
    }

    // Persist the Wazo UUID BEFORE provisioning contexts.
    await prisma.organization.update({
      where: { id: companyId },
      data: { wazoTenantUuid: tenantUuid },
    });

    await tenantService.setupCalling(tenantUuid);

    await incomingSetupService.create(tenantUuid);

    const active = await prisma.organization.update({
      where: { id: companyId },
      data: {
        status: 'ACTIVE',
        provisionedAt: new Date(),
        provisioningError: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        wazoTenantUuid: true,
        provisionedAt: true,
      },
    });

    return active;
  } catch (error) {
    // Never delete a tenant automatically on failure.
    // A tenant may already exist in Wazo even when its
    // creation response was incomplete or DB saving failed.
    const message = createAttempted
      ? (
          `Provisioning requires review: ${error.message}. ` +
          'Check Wazo before retrying.'
        )
      : error.message;

    try {
      await prisma.organization.updateMany({
        where: {
          id: companyId,
          status: 'PROVISIONING',
        },
        data: {
          status: 'FAILED_PROVISIONING',
          provisioningError: message.slice(0, 1000),
        },
      });
    } catch (saveError) {
      console.error(
        'Could not persist provisioning failure:',
        saveError
      );
    }

    console.error('Company provisioning failed:', {
      companyId,
      tenantUuid,
      error,
    });

    throw new HttpError(
      502,
      'Company provisioning failed. Review the recorded ' +
        'provisioning state before retrying.'
    );
  }
}

async function rejectCompany(
  companyId,
  adminId,
  rawReason
) {
  validateCompanyId(companyId);

  const reason =
    typeof rawReason === 'string'
      ? rawReason.trim()
      : '';

  if (reason.length < 5 || reason.length > 500) {
    throw new HttpError(
      400,
      'Rejection reason must be 5-500 characters'
    );
  }

  const result = await prisma.organization.updateMany({
    where: {
      id: companyId,
      status: 'PENDING',
    },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new HttpError(
      409,
      'Only pending companies can be rejected'
    );
  }

  return prisma.organization.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      status: true,
      rejectionReason: true,
      reviewedAt: true,
    },
  });
}

module.exports = {
  listCompanies,
  approveCompany,
  rejectCompany,
};
