import jwt from 'jsonwebtoken';

export function requireAuth(c) {
  const token = c.req.cookie('session');
  if (!token) {
    return c.json({ error: 'Unauthorized', code: 401 }, 401);
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    c.set('user', decoded);
  } catch (_err) {
    return c.json({ error: 'Unauthorized', code: 401 }, 401);
  }
}

export function requireRole(...roles) {
  return function (c) {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden', code: 403 }, 403);
    }
  };
}

export function onError(err, c) {
  const status = err.status || 500;
  return c.json(
    {
      error: err.message || 'Internal error',
      code: status,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    },
    status
  );
}

export function notFound(c) {
  return c.json({ error: 'Not found', code: 404 }, 404);
}

const rateLimitStore = new Map();

export function rateLimitMiddleware(requestsPerMin = 60) {
  return async function (c, next) {
    const ip = c.env?.remoteAddress || c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000;
    let entry = rateLimitStore.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(ip, entry);
    }
    entry.count++;
    if (entry.count > requestsPerMin) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    await next();
  };
}
