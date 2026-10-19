
const crypto = require('node:crypto');
const argon2 = require('argon2');

const authRepository = require('../repository/auth.repository');

// ==========================================
// CONFIGURATION
// ==========================================

const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_MS =
  SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

const SESSION_COOKIE_NAME = 'saas_session';

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

// Argon2id configuration
const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

// ==========================================
// ERRORS
// ==========================================

class AuthError extends Error {
  constructor(message, statusCode = 401, code = 'AUTH_ERROR') {
    super(message);

    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;

    Error.captureStackTrace?.(this, AuthError);
  }
}

// ==========================================
// VALIDATION
// ==========================================

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new AuthError(
      'A valid email address is required',
      400,
      'INVALID_EMAIL'
    );
  }

  const normalized = email.trim().toLowerCase();

  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new AuthError(
      'A valid email address is required',
      400,
      'INVALID_EMAIL'
    );
  }

  return normalized;
}

function validatePassword(password) {
  if (
    typeof password !== 'string' ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new AuthError(
      `Password must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
      400,
      'INVALID_PASSWORD'
    );
  }

  return password;
}

// ==========================================
// PASSWORD HASHING
// ==========================================

async function hashPassword(password) {
  validatePassword(password);

  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

async function verifyPassword(password, passwordHash) {
  if (
    typeof password !== 'string' ||
    typeof passwordHash !== 'string'
  ) {
    return false;
  }

  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

// ==========================================
// SESSION TOKEN UTILITIES
// ==========================================

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function isValidSessionToken(token) {
  return (
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/.test(token)
  );
}

function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

// ==========================================
// USER PRESENTATION
// ==========================================

function toPublicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toPublicMembership(membership) {
  return {
    id: membership.id,
    role: membership.role,
    organization: membership.organization
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
          wazoTenantUuid:
            membership.organization.wazoTenantUuid,
        }
      : null,
  };
}

// ==========================================
// LOGIN
// ==========================================

async function login({ email, password } = {}) {
  const normalizedEmail = normalizeEmail(email);

  if (
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new AuthError(
      'Email or password is incorrect',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const user = await authRepository.findUserByEmail(
    normalizedEmail
  );

  // For validly formatted login attempts with an unknown email,
  // perform an Argon2 operation to reduce timing differences.
  const passwordHashToCheck = user?.passwordHash
    || await getDummyPasswordHash();

  const passwordMatches = await verifyPassword(
    password,
    passwordHashToCheck
  );

  if (!user || !passwordMatches || !user.isActive) {
    throw new AuthError(
      'Email or password is incorrect',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = getSessionExpiryDate();

  const session = await authRepository.createSession({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return {
    user: toPublicUser(user),
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },

    // Only the controller should put this into a secure cookie.
    // Never serialize it into an API response body or logs.
    sessionToken,
  };
}

// ==========================================
// DUMMY HASH FOR UNKNOWN USERS
// ==========================================

let dummyPasswordHashPromise = null;

function getDummyPasswordHash() {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = argon2.hash(
      'dummy-password-not-a-real-account',
      PASSWORD_HASH_OPTIONS
    ).catch((error) => {
      dummyPasswordHashPromise = null;
      throw error;
    });
  }

  return dummyPasswordHashPromise;
}

// ==========================================
// AUTHENTICATE SESSION
// ==========================================

async function authenticateSession(sessionToken) {
  if (!isValidSessionToken(sessionToken)) {
    throw new AuthError(
      'Authentication required',
      401,
      'UNAUTHENTICATED'
    );
  }

  const tokenHash = hashSessionToken(sessionToken);

  const session =
    await authRepository.findActiveSessionByTokenHash(
      tokenHash
    );

  if (!session || !session.user) {
    throw new AuthError(
      'Session has expired or is invalid',
      401,
      'INVALID_SESSION'
    );
  }

  return {
    user: toPublicUser(session.user),
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    },
  };
}

// ==========================================
// CURRENT USER
// ==========================================

async function getCurrentUser(sessionToken) {
  const authenticated = await authenticateSession(
    sessionToken
  );

  const user =
    await authRepository.findUserByIdWithMemberships(
      authenticated.user.id
    );

  if (!user || !user.isActive) {
    throw new AuthError(
      'Authentication required',
      401,
      'UNAUTHENTICATED'
    );
  }

  return {
    user: toPublicUser(user),

    memberships: (user.memberships || []).map(
      toPublicMembership
    ),

    session: authenticated.session,
  };
}

// ==========================================
// LOGOUT
// ==========================================

async function logout(sessionToken) {
  if (!isValidSessionToken(sessionToken)) {
    return { success: true };
  }

  const tokenHash = hashSessionToken(sessionToken);

  await authRepository.revokeSessionByTokenHash(
    tokenHash
  );

  return { success: true };
}

// ==========================================
// LOGOUT FROM ALL DEVICES
// ==========================================

async function logoutAll(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new AuthError(
      'Authentication required',
      401,
      'UNAUTHENTICATED'
    );
  }

  await authRepository.revokeAllUserSessions(userId);

  return { success: true };
}

// ==========================================
// AUTHORIZATION HELPERS
// ==========================================

function isPlatformAdmin(user) {
  return (
    Boolean(user?.isActive) &&
    user.platformRole === 'PLATFORM_ADMIN'
  );
}

async function getTenantMembership(
  userId,
  wazoTenantUuid
) {
  if (!userId || !wazoTenantUuid) {
    return null;
  }

  return authRepository.findMembershipByWazoTenantUuid(
    userId,
    wazoTenantUuid
  );
}

async function requireTenantRole(
  user,
  wazoTenantUuid,
  allowedRoles = []
) {
  if (!user || !user.isActive) {
    throw new AuthError(
      'Authentication required',
      401,
      'UNAUTHENTICATED'
    );
  }

  if (isPlatformAdmin(user)) {
    return {
      allowed: true,
      platformAdmin: true,
      membership: null,
    };
  }

  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new AuthError(
      'Access denied',
      403,
      'FORBIDDEN'
    );
  }

  const membership = await getTenantMembership(
    user.id,
    wazoTenantUuid
  );

  if (
    !membership ||
    !allowedRoles.includes(membership.role)
  ) {
    throw new AuthError(
      'You do not have permission to access this company',
      403,
      'TENANT_ACCESS_DENIED'
    );
  }

  return {
    allowed: true,
    platformAdmin: false,
    membership,
  };
}



/**
 * Register a normal SaaS customer.
 *
 * This does not create a Wazo telephony user,
 * Wazo tenant, or platform administrator.
 */
async function registerCustomer({ name, email, password } = {}) {
  if (typeof name !== 'string') {
    throw new AuthError(
      'Name is required',
      400,
      'INVALID_NAME'
    );
  }

  const normalizedName = name.trim();

  if (
    normalizedName.length < 2 ||
    normalizedName.length > 100
  ) {
    throw new AuthError(
      'Name must contain between 2 and 100 characters',
      400,
      'INVALID_NAME'
    );
  }

  const normalizedEmail = normalizeEmail(email);

  // Uses the existing password length validation
  // and Argon2id password hashing.
  const passwordHash = await hashPassword(password);

  try {
    const user = await authRepository.createUser({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,

      // Never accept platformRole from request body.
      platformRole: 'USER',
      isActive: true,
    });

    return {
      user: toPublicUser(user),
      emailVerificationRequired: true,
    };
  } catch (error) {
    // Database uniqueness is the final protection
    // against duplicate emails, including concurrent requests.
    if (error.code === 'P2002') {
      throw new AuthError(
        'An account with this email already exists',
        409,
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    throw error;
  }
}


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  AuthError,

  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  registerCustomer,

  normalizeEmail,
  validatePassword,
  hashPassword,
  verifyPassword,

  generateSessionToken,
  hashSessionToken,
  isValidSessionToken,

  login,
  authenticateSession,
  getCurrentUser,
  logout,
  logoutAll,

  isPlatformAdmin,
  getTenantMembership,
  requireTenantRole,
};
