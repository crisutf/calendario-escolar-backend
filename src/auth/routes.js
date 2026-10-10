import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/index.js';

export function authRoutes(app) {
  app.post('/api/auth/google', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const token = body.credential || body.token;

    if (!token) {
      return c.json({ error: 'Missing credential/token', code: 400 }, 400);
    }

    try {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const { email, name, picture } = payload;

      if (!email) {
        return c.json({ error: 'Invalid token payload', code: 400 }, 400);
      }

      const existing = db.query('SELECT * FROM users WHERE email = ?').get(email);
      let userId;

      if (existing) {
        db.run(
          'UPDATE users SET name = COALESCE(?, name), picture = COALESCE(?, picture) WHERE id = ?',
          [name || null, picture || null, existing.id]
        );
        userId = existing.id;
      } else {
        const result = db.run(
          'INSERT INTO users (email, name, picture, role, subject, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
          [email, name || null, picture || null, 'profesor', null, Date.now()]
        );
        userId = Number(result.lastInsertRowid);
      }

      const user = db.query(
        'SELECT id, email, name, role, subject, picture FROM users WHERE id = ?'
      ).get(userId);

      const jwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        subject: user.subject,
      };

      const tokenSigned = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: '30d' });

      setCookie(c, 'session', tokenSigned, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 3600,
      });

      return c.json({ ok: true, user });
    } catch (err) {
      return c.json({ error: err.message || 'Invalid Google token', code: 401 }, 401);
    }
  });

  app.get('/api/auth/me', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const user = c.get('user');
    return c.json({ user });
  });

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ ok: true });
  });
}
