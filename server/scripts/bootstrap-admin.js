
require('dotenv').config();

const prisma = require('../config/prisma');
const authRepository = require('../repository/auth.repository');

const {
  normalizeEmail,
  hashPassword,
} = require('../service/auth.service');

async function main() {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const rawName = process.env.BOOTSTRAP_ADMIN_NAME;
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!rawEmail || !rawName || !rawPassword) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, ' +
      'and BOOTSTRAP_ADMIN_PASSWORD are required'
    );
  }

  const email = normalizeEmail(rawEmail);
  const name = rawName.trim();

  if (!name || name.length > 100) {
    throw new Error(
      'Administrator name must be between 1 and 100 characters'
    );
  }

  // Bootstrap is only for the initial platform administrator.
  const existingAdmins = await prisma.user.count({
    where: {
      platformRole: 'PLATFORM_ADMIN',
    },
  });

  if (existingAdmins > 0) {
    throw new Error(
      'A platform administrator already exists. ' +
      'Bootstrap is disabled.'
    );
  }

  const existingUser =
    await authRepository.findUserByEmail(email);

  if (existingUser) {
    throw new Error(
      'A user with this email already exists'
    );
  }

  const passwordHash = await hashPassword(rawPassword);

  const admin = await authRepository.createUser({
    email,
    name,
    passwordHash,
    platformRole: 'PLATFORM_ADMIN',
    isActive: true,
  });

  console.log('Initial platform administrator created');
  console.log({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    platformRole: admin.platformRole,
  });
}

main()
  .catch((error) => {
    console.error(
      'Bootstrap failed:',
      error.message
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
