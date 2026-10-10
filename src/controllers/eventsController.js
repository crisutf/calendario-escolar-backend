import { v4 as uuidv4 } from 'uuid';
import { readData, writeData, files } from '../utils/storage.js';

const VALID_TYPES = ['event', 'exam', 'holiday'];
const VALID_STATUS = ['approved', 'pending', 'rejected'];

function applyFilters(events, query = {}) {
  let result = [...events];
  const { type, month, subject, search } = query;

  if (type && VALID_TYPES.includes(type)) {
    result = result.filter((e) => e.type === type);
  }
  if (month) {
    const prefix = String(month).slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(prefix)) {
      result = result.filter((e) => String(e.date || '').startsWith(prefix));
    }
  }
  if (subject) {
    const subj = String(subject).toLowerCase();
    result = result.filter((e) => (e.subject || '').toLowerCase().includes(subj));
  }
  if (search) {
    const q = String(search).toLowerCase();
    result = result.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.subject || '').toLowerCase().includes(q),
    );
  }
  return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function getNormalizedEvents() {
  const events = await readData(files.events);
  let changed = false;
  const normalized = events.map((e) => {
    let item = { ...e };
    if (!item.id) {
      item.id = uuidv4();
      changed = true;
    }
    if (!item.status) {
      item.status = 'approved';
      changed = true;
    }
    return item;
  });
  if (changed) {
    await writeData(files.events, normalized);
  }
  return normalized;
}

export async function getPublicEvents(req, res) {
  try {
    const events = await getNormalizedEvents();
    const settings = await readData(files.settings);
    const approved = events.filter((e) => e.status !== 'rejected' && e.status !== 'pending');
    const filtered = applyFilters(approved, req.query);
    res.json({
      ok: true,
      count: filtered.length,
      events: filtered,
      data: filtered,
      meta: {
        maintenance: (settings && settings.maintenance) || { mode: false, message: '' },
      },
    });
  } catch (error) {
    console.error('getPublicEvents error:', error.message);
    res.status(500).json({ error: 'Error cargando los eventos.' });
  }
}

export async function getAdminEvents(req, res) {
  try {
    const events = await getNormalizedEvents();
    const filtered = applyFilters(events, req.query);
    res.json({
      ok: true,
      count: filtered.length,
      events: filtered,
      data: filtered,
    });
  } catch (error) {
    console.error('getAdminEvents error:', error.message);
    res.status(500).json({ error: 'Error cargando los eventos.' });
  }
}

export async function createEvent(req, res) {
  try {
    const { date, title, type = 'event', subject = null, description = null, status = 'approved' } = req.body || {};
    if (!date || !title) {
      return res.status(400).json({ error: 'Campos obligatorios: date y title.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Usa uno de: ${VALID_TYPES.join(', ')}.` });
    }
    const validStatus = VALID_STATUS.includes(status) ? status : 'approved';

    const events = await getNormalizedEvents();
    const newEvent = {
      id: uuidv4(),
      date: String(date),
      title: String(title).trim(),
      type,
      subject: subject ? String(subject).trim() : null,
      description: description ? String(description).trim() : null,
      status: validStatus,
      createdBy: req.user?.email || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    events.push(newEvent);
    await writeData(files.events, events);
    console.log(`➕ Evento creado: ${newEvent.date} ${newEvent.title} (${newEvent.type}) por ${req.user?.email}`);
    res.status(201).json({ ok: true, event: newEvent, data: newEvent });
  } catch (error) {
    console.error('createEvent error:', error.message);
    res.status(500).json({ error: 'Error creando el evento.' });
  }
}

export async function updateEvent(req, res) {
  try {
    const { id } = req.params;
    const events = await getNormalizedEvents();
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    const current = events[idx];
    const body = req.body || {};

    if (body.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))) {
        return res.status(400).json({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD.' });
      }
      current.date = String(body.date);
    }
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t) return res.status(400).json({ error: 'El título no puede estar vacío.' });
      current.title = t;
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type)) {
        return res.status(400).json({ error: `Tipo inválido. Usa uno de: ${VALID_TYPES.join(', ')}.` });
      }
      current.type = body.type;
    }
    if (body.subject !== undefined) {
      current.subject = body.subject ? String(body.subject).trim() : null;
    }
    if (body.description !== undefined) {
      current.description = body.description ? String(body.description).trim() : null;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUS.includes(body.status)) {
        return res.status(400).json({ error: `Estado inválido. Usa uno de: ${VALID_STATUS.join(', ')}.` });
      }
      current.status = body.status;
    }
    current.updatedAt = new Date().toISOString();
    current.updatedBy = req.user?.email || null;

    events[idx] = current;
    await writeData(files.events, events);
    console.log(`✏️ Evento actualizado: ${current.id} por ${req.user?.email}`);
    res.json({ ok: true, event: current });
  } catch (error) {
    console.error('updateEvent error:', error.message);
    res.status(500).json({ error: 'Error actualizando el evento.' });
  }
}

export async function deleteEvent(req, res) {
  try {
    const { id } = req.params;
    const events = await getNormalizedEvents();
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    const deleted = events.splice(idx, 1)[0];
    await writeData(files.events, events);
    console.log(`🗑️ Evento eliminado: ${deleted.id} (${deleted.title}) por ${req.user?.email}`);
    res.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error('deleteEvent error:', error.message);
    res.status(500).json({ error: 'Error eliminando el evento.' });
  }
}

export default {
  getPublicEvents,
  getAdminEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};
