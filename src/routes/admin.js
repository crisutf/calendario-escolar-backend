import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/index.js';

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('low'),
  expiresAt: z.number().optional().nullable(),
});

const userUpdateSchema = z.object({
  role: z.enum(['admin', 'tutor', 'profesor']),
  subject: z.string().optional().nullable(),
});

const maintenanceSchema = z.object({
  mode: z.boolean(),
  message: z.string().optional(),
});

export function adminRoutes(app) {
  app.get('/api/admin/maintenance', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin')(c);
    if (roleRes) return roleRes;

    const modeRow = db.query("SELECT value FROM settings WHERE key = 'maintenance.mode'").get();
    const msgRow = db.query("SELECT value FROM settings WHERE key = 'maintenance.message'").get();

    return c.json({
      mode: JSON.parse(modeRow?.value || 'false'),
      message: msgRow?.value || '',
    });
  });

  app.put('/api/admin/maintenance', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin')(c);
    if (roleRes) return roleRes;

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 400 }, 400);
    }
    const parsed = maintenanceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', code: 400, issues: parsed.error.issues }, 400);
    }

    const { mode, message } = parsed.data;
    const modeStr = JSON.stringify(mode);
    const msgStr = message !== undefined ? message : '';

    db.run(
      `INSERT INTO settings (key, value) VALUES ('maintenance.mode', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [modeStr]
    );
    db.run(
      `INSERT INTO settings (key, value) VALUES ('maintenance.message', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [msgStr]
    );

    return c.json({ ok: true, mode, message: msgStr }, 200);
  });

  app.get('/api/announcements', (c) => {
    const now = Date.now();
    const rows = db
      .query(
        `SELECT id, title, body, priority, createdAt, expiresAt
         FROM announcements
         WHERE expiresAt IS NULL OR expiresAt > ?
         ORDER BY createdAt DESC`
      )
      .all(now);
    return c.json({ data: rows });
  });

  app.get('/api/admin/announcements', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin', 'tutor')(c);
    if (roleRes) return roleRes;

    const rows = db
      .query(
        `SELECT id, title, body, priority, createdAt, expiresAt
         FROM announcements ORDER BY createdAt DESC`
      )
      .all();
    return c.json({ data: rows });
  });

  app.post('/api/admin/announcements', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin', 'tutor')(c);
    if (roleRes) return roleRes;

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 400 }, 400);
    }
    const parsed = announcementSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', code: 400, issues: parsed.error.issues }, 400);
    }

    const { title, body: bodyText, priority, expiresAt } = parsed.data;
    const now = Date.now();

    const result = db.run(
      `INSERT INTO announcements (title, body, priority, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?)`,
      [title, bodyText, priority, now, expiresAt ?? null]
    );

    const inserted = db.query('SELECT * FROM announcements WHERE id = ?').get(Number(result.lastInsertRowid));
    return c.json(inserted, 201);
  });

  app.delete('/api/admin/announcements/:id', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin', 'tutor')(c);
    if (roleRes) return roleRes;

    const id = Number(c.req.param('id'));
    const existing = db.query('SELECT id FROM announcements WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Not found', code: 404 }, 404);
    }
    db.run('DELETE FROM announcements WHERE id = ?', [id]);
    return c.json({ ok: true }, 200);
  });

  app.get('/api/admin/users', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin')(c);
    if (roleRes) return roleRes;

    const users = db
      .query(
        `SELECT id, email, name, role, subject, picture, createdAt
         FROM users ORDER BY createdAt DESC`
      )
      .all();
    return c.json({ data: users });
  });

  app.put('/api/admin/users/:id', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin')(c);
    if (roleRes) return roleRes;

    const id = Number(c.req.param('id'));
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON', code: 400 }, 400);
    }
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', code: 400, issues: parsed.error.issues }, 400);
    }

    const existing = db.query('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Not found', code: 404 }, 404);
    }

    const { role, subject } = parsed.data;
    db.run(
      'UPDATE users SET role = ?, subject = ? WHERE id = ?',
      [role, subject ?? null, id]
    );

    const updated = db.query(
      'SELECT id, email, name, role, subject, picture, createdAt FROM users WHERE id = ?'
    ).get(id);
    return c.json(updated, 200);
  });

  app.delete('/api/admin/users/:id', async (c) => {
    const res = requireAuth(c);
    if (res) return res;
    const roleRes = requireRole('admin')(c);
    if (roleRes) return roleRes;

    const id = Number(c.req.param('id'));
    const currentUser = c.get('user');

    if (currentUser.sub === id) {
      return c.json({ error: 'Cannot delete yourself', code: 400 }, 400);
    }

    const existing = db.query('SELECT id FROM users WHERE id = ?').get(id);
    if (!existing) {
      return c.json({ error: 'Not found', code: 404 }, 404);
    }
    db.run('DELETE FROM users WHERE id = ?', [id]);
    return c.json({ ok: true }, 200);
  });
}
