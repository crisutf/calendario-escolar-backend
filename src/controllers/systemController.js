import { readData, writeData, files, getDataDirSize, getDataDirFileSizes } from '../utils/storage.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '354181204077-6fl12f30sv9rabelq6ddupahvrapsg2q.apps.googleusercontent.com';

export async function updateMaintenance(req, res) {
  try {
    const { mode, message = '' } = req.body || {};
    if (typeof mode !== 'boolean') {
      return res.status(400).json({ error: '"mode" debe ser true o false.' });
    }
    const settings = await readData(files.settings);
    settings.maintenance = {
      mode: !!mode,
      message: message ? String(message).trim() : '',
      updatedAt: new Date().toISOString(),
      updatedBy: { email: req.user?.email || null, name: req.user?.name || null },
    };
    await writeData(files.settings, settings);
    console.log(`🛠️ Modo mantenimiento: ${settings.maintenance.mode ? 'ACTIVADO' : 'DESACTIVADO'} por ${req.user?.email}`);
    res.json({ ok: true, maintenance: settings.maintenance });
  } catch (error) {
    console.error('updateMaintenance error:', error.message);
    res.status(500).json({ error: 'Error actualizando el modo mantenimiento.' });
  }
}

export async function getSystemInfo(req, res) {
  try {
    const [events, announcements, accounts, settings, dbSize, fileSizes] = await Promise.all([
      readData(files.events),
      readData(files.announcements),
      readData(files.accounts),
      readData(files.settings),
      getDataDirSize(),
      getDataDirFileSizes(),
    ]);

    const runtimeVersion =
      (typeof Bun !== 'undefined' && Bun.version) ||
      (typeof process !== 'undefined' && process.version) ||
      'unknown';

    const counts = {
      events: events.length,
      exams: events.filter((e) => e.type === 'exam').length,
      holidays: events.filter((e) => e.type === 'holiday').length,
      generalEvents: events.filter((e) => e.type === 'event').length,
      announcements: announcements.length,
      users: accounts.length,
      admins: accounts.filter((a) => a.role === 'admin' || a.role === 'root' || a.isRoot).length,
      root: accounts.filter((a) => a.role === 'root' || a.isRoot).length,
    };

    const platformInfo = {
      runtime: typeof Bun !== 'undefined' ? 'Bun' : 'Node',
      runtimeVersion,
      bunVersion: runtimeVersion,
      platform: typeof process !== 'undefined' ? process.platform : 'unknown',
      arch: typeof process !== 'undefined' ? process.arch : 'unknown',
      uptimeSeconds: typeof process !== 'undefined' ? Math.floor(process.uptime()) : 0,
      nodeEnv: process.env.NODE_ENV || 'development',
      environment: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '9234', 10),
      processId: typeof process !== 'undefined' ? process.pid : null,
    };

    res.json({
      ok: true,
      ...platformInfo,
      bunVersion: runtimeVersion,
      dbSize: dbSize,
      dbEngine: 'json-flat-file',
      storage: {
        engine: 'JSON Flat File (fs-extra)',
        path: './data',
        totalSize: dbSize,
        files: fileSizes,
      },
      database: {
        engine: 'JSON Flat File (fs-extra)',
        path: './data',
        size: dbSize,
      },
      googleClientId: !!GOOGLE_CLIENT_ID,
      google: {
        clientId: GOOGLE_CLIENT_ID,
        hasClientSecret: !!(process.env.GOOGLE_CLIENT_SECRET || '').length,
      },
      maintenance: (settings && settings.maintenance) || { mode: false, message: '' },
      counts,
    });
  } catch (error) {
    console.error('getSystemInfo error:', error.message);
    res.status(500).json({ error: 'Error obteniendo la información del sistema.' });
  }
}

export default {
  updateMaintenance,
  getSystemInfo,
};
