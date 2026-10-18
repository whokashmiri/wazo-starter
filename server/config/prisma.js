
const { PrismaClient } = require('@prisma/client');

/**
 * Shared Prisma Client instance.
 *
 * Reuse one PrismaClient across the application to avoid
 * creating unnecessary database connection pools.
 */
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__wazoSaasPrisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

// Reuse the instance during development and server reloads.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__wazoSaasPrisma = prisma;
}

module.exports = prisma;
