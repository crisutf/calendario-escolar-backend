import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { initStorage, readData, files } from './utils/storage.js';
import { initTokenBlacklist } from './utils/tokenManager.js';
import { getGoogleAuthInfo } from './controllers/authController.js';

import authRoutes from './routes/authRoutes.js';
import eventsRoutes from './routes/eventsRoutes.js';
import announcementsRoutes from './routes/announcementsRoutes.js';

import adminEventsRoutes from './routes/adminEventsRoutes.js';
import adminAnnouncementsRoutes from './routes/adminAnnouncementsRoutes.js';
import adminUsersRoutes from './routes/adminUsersRoutes.js';
import adminSystemRoutes from './routes/adminSystemRoutes.js';

const PORT = parseInt(process.env.PORT || '9234', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN_RAW = process.env.CORS_ORIGIN || 'https://digital.crisu.qzz.io,https://dev-management-digital-v1.crisu.qzz.io';
const CORS_ORIGINS = CORS_ORIGIN_RAW.split(',').map((s) => s.trim()).filter(Boolean);

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes('*')) {
          return callback(null, true);
        }
        if (NODE_ENV === 'development') return callback(null, true);
        return callback(new Error(`Origen no permitido por CORS: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      maxAge: 86400,
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.get('/api/status', async (_req, res) => {
    try {
      const events = await readData(files.events);
      const accounts = await readData(files.accounts);
      res.json({
        ok: true,
        service: 'calendario-escolar-backend',
        runtime: typeof Bun !== 'undefined' ? 'Bun' : 'Node',
        runtimeVersion: (typeof Bun !== 'undefined' && Bun.version) || process.version,
        nodeEnv: NODE_ENV,
        timestamp: new Date().toISOString(),
        port: PORT,
        stats: {
          events: events.length,
          users: accounts.length,
        },
        endpoints: {
          auth: '/api/auth/*',
          public: {
            events: 'GET /api/events',
            announcements: 'GET /api/announcements',
          },
          admin: {
            events: 'GET/POST /api/admin/events | PUT/DELETE /api/admin/events/:id',
            announcements: 'GET/POST /api/admin/announcements | DELETE /api/admin/announcements/:id',
            users: 'GET /api/admin/users | PUT/DELETE /api/admin/users/:id',
            maintenance: 'PUT /api/admin/maintenance',
            system: 'GET /api/admin/system/info',
          },
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/announcements', announcementsRoutes);

  const adminRouter = express.Router();
  adminRouter.use(adminEventsRoutes);
  adminRouter.use(adminAnnouncementsRoutes);
  adminRouter.use(adminUsersRoutes);
  adminRouter.use(adminSystemRoutes);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint API no encontrado.' });
  });

  app.use((err, _req, res, _next) => {
    console.error('❌ Error Express:', err.message || err);
    const status = err.statusCode || err.status || 500;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      error: err.message || 'Error interno del servidor.',
    });
  });

  return app;
}

async function bootstrap() {
  console.log(`🚀 Iniciando backend calendario-escolar...`);
  console.log(`   Entorno: ${NODE_ENV}`);
  console.log(`   Puerto:  ${PORT}`);
  console.log(`   CORS:    ${CORS_ORIGINS.join(', ')}`);
  console.log(`   Runtime: ${typeof Bun !== 'undefined' ? 'Bun ' + Bun.version : 'Node ' + process.version}`);

  await initStorage();
  await initTokenBlacklist();

  const app = createApp();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
    console.log(`   Status endpoint: http://localhost:${PORT}/api/status`);
  });
}

bootstrap().catch((err) => {
  console.error('💥 Fatal error durante el bootstrap:', err);
  process.exit?.(1);
});
