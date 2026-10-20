
const {
  authenticateSession,
  SESSION_COOKIE_NAME,
} = require('../service/auth.service');

/**
 * Express middleware that requires a valid SaaS session.
 *
 * Prerequisite:
 *   app.use(cookieParser());
 *
 * On success:
 *   req.user = authenticated SaaS user
 *   req.auth = { user, session }
 *
 * On failure:
 *   HTTP 401
 */
async function authenticate(req, res, next) {
  try {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
    }

    const auth = await authenticateSession(sessionToken);

    req.user = auth.user;
    req.auth = auth;

    return next();
  } catch (error) {
    if (
      error.statusCode === 401 ||
      error.status === 401
    ) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: error.code || 'UNAUTHENTICATED',
      });
    }

    return next(error);
  }
}

/**
 * Optional authentication.
 *
 * Allows unauthenticated requests to continue, but attaches
 * req.user and req.auth when a valid session cookie exists.
 *
 * Only use on endpoints that genuinely support anonymous access.
 */
async function optionalAuthenticate(req, res, next) {
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return next();
  }

  try {
    const auth = await authenticateSession(sessionToken);

    req.user = auth.user;
    req.auth = auth;

    return next();
  } catch (error) {
    if (
      error.statusCode === 401 ||
      error.status === 401
    ) {
      return next();
    }

    return next(error);
  }
}

module.exports = {
  authenticate,
  optionalAuthenticate,
};
