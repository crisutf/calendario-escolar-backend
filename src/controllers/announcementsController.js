import { v4 as uuidv4 } from 'uuid';
import { readData, writeData, files } from '../utils/storage.js';

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export async function getPublicAnnouncements(req, res) {
  try {
    const list = await readData(files.announcements);
    const now = new Date();
    const active = list
      .filter((a) => !a.expiresAt || new Date(a.expiresAt) > now)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, count: active.length, announcements: active, data: active });
  } catch (error) {
    console.error('getPublicAnnouncements error:', error.message);
    res.status(500).json({ error: 'Error cargando los comunicados.' });
  }
}

export async function getAdminAnnouncements(req, res) {
  try {
    const list = await readData(files.announcements);
    const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, count: sorted.length, announcements: sorted, data: sorted });
  } catch (error) {
    console.error('getAdminAnnouncements error:', error.message);
    res.status(500).json({ error: 'Error cargando los comunicados.' });
  }
}

export async function createAnnouncement(req, res) {
  try {
    const { title, body = '', priority = 'normal', expiresAt = null, url = null } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Falta el título del comunicado.' });
    }
    const prio = VALID_PRIORITIES.includes(priority) ? priority : 'normal';
    if (expiresAt && isNaN(new Date(expiresAt).getTime())) {
      return res.status(400).json({ error: 'Fecha de caducidad inválida.' });
    }
    const list = await readData(files.announcements);
    const ann = {
      id: uuidv4(),
      title: String(title).trim(),
      body: String(body || '').trim(),
      priority: prio,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      url: url ? String(url).trim() : null,
      createdBy: { email: req.user?.email || null, name: req.user?.name || null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.push(ann);
    await writeData(files.announcements, list);
    console.log(`📣 Comunicado creado: ${ann.title} (${ann.priority}) por ${req.user?.email}`);
    res.status(201).json({ ok: true, announcement: ann });
  } catch (error) {
    console.error('createAnnouncement error:', error.message);
    res.status(500).json({ error: 'Error creando el comunicado.' });
  }
}

export async function deleteAnnouncement(req, res) {
  try {
    const { id } = req.params;
    const list = await readData(files.announcements);
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Comunicado no encontrado.' });
    const deleted = list.splice(idx, 1)[0];
    await writeData(files.announcements, list);
    console.log(`🗑️ Comunicado eliminado: ${deleted.id} por ${req.user?.email}`);
    res.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error('deleteAnnouncement error:', error.message);
    res.status(500).json({ error: 'Error eliminando el comunicado.' });
  }
}

export default {
  getPublicAnnouncements,
  getAdminAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
};
