import { v4 as uuidv4 } from 'uuid';
import { readData, writeData, files } from '../utils/storage.js';
import { hashPassword } from '../utils/passwords.js';

const ROOT_EMAIL = (process.env.ROOT_ADMIN_EMAIL || process.env.FIRST_ADMIN_EMAIL || 'cristiancorban210@gmail.com').trim().toLowerCase();
const VALID_ROLES = ['admin'];

function sanitizeAccount(account) {
  const email = String(account.email || '').trim().toLowerCase();
  const isRoot = account.role === 'root' || email === ROOT_EMAIL || !!account.isRoot;
  const rawRole = account.role;
  const normalizedRole =
    isRoot ? 'root'
    : VALID_ROLES.includes(rawRole) ? rawRole
    : 'admin';
  return {
    id: account.id,
    email,
    name: account.name,
    picture: account.picture || null,
    role: normalizedRole,
    isRoot,
    hasPassword: !!(account.passwordHash && account.salt),
    createdAt: account.createdAt,
    lastLogin: account.lastLogin || null,
  };
}

export async function getAdminUsers(req, res) {
  try {
    const accounts = await readData(files.accounts);
    const { search, role } = req.query || {};
    let list = accounts.map(sanitizeAccount);
    if (role && (VALID_ROLES.includes(role) || role === 'root')) {
      list = list.filter((a) => a.role === role);
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(
        (a) =>
          a.email.toLowerCase().includes(q) ||
          (a.name || '').toLowerCase().includes(q) ||
          (a.subject || '').toLowerCase().includes(q) ||
          (a.role || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
    res.json({
      ok: true,
      count: list.length,
      users: list,
      data: list,
    });
  } catch (error) {
    console.error('getAdminUsers error:', error.message);
    res.status(500).json({ error: 'Error cargando los usuarios.' });
  }
}

export async function createUser(req, res) {
  try {
    const { name, email, password, role = 'admin' } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPass = String(password);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Formato de correo electrónico inválido.' });
    }

    if (cleanPass.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
    }

    if (role === 'root') {
      return res.status(403).json({ error: 'El rol root es exclusivo del servidor y no puede ser asignado.' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Rol inválido. Usa uno de: ${VALID_ROLES.join(', ')}.` });
    }

    const accounts = await readData(files.accounts);
    const exists = accounts.find((a) => a.email.toLowerCase() === cleanEmail);
    if (exists) {
      return res.status(409).json({ error: 'Ya existe un usuario con este correo electrónico.' });
    }

    const { salt, hash } = hashPassword(cleanPass);

    const newAccount = {
      id: uuidv4(),
      email: cleanEmail,
      name: cleanName,
      picture: null,
      role,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };

    accounts.push(newAccount);
    await writeData(files.accounts, accounts);

    console.log(`👤 Nuevo usuario creado: ${cleanEmail} (${role}) por admin ${req.user?.email}`);
    res.status(201).json({
      ok: true,
      user: sanitizeAccount(newAccount),
      data: sanitizeAccount(newAccount),
    });
  } catch (error) {
    console.error('createUser error:', error.message);
    res.status(500).json({ error: 'Error al crear el usuario: ' + error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, role, password } = req.body || {};
    const accounts = await readData(files.accounts);
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const account = accounts[idx];

    const isTargetRoot = account.role === 'root' || account.email.toLowerCase() === ROOT_EMAIL || !!account.isRoot;
    const isCallerRoot = req.user?.isRoot || req.user?.role === 'root' || req.user?.email.toLowerCase() === ROOT_EMAIL;
    const isSelf = req.user?.id === account.id || req.user?.email.toLowerCase() === account.email.toLowerCase();

    if (name !== undefined && String(name).trim()) {
      if (isTargetRoot && !isCallerRoot) {
        return res.status(403).json({ error: 'No tienes permiso para modificar el nombre del usuario root.' });
      }
      account.name = String(name).trim();
    }

    if (role !== undefined) {
      if (isTargetRoot) {
        return res.status(403).json({ error: 'No se puede modificar el rol del administrador principal (root).' });
      }
      if (role === 'root') {
        return res.status(403).json({ error: 'El rol root es exclusivo del servidor y no puede ser asignado a otros usuarios.' });
      }
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `Rol inválido. Usa uno de: ${VALID_ROLES.join(', ')}.` });
      }
      if (account.role === 'admin' && !isCallerRoot && !isSelf) {
        return res.status(403).json({ error: 'Solo el usuario root puede cambiar el rol de otros administradores.' });
      }
      account.role = role;
    }

    if (password !== undefined && password !== null && password !== '') {
      if (String(password).length < 4) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
      }
      if (isTargetRoot && !isSelf) {
        return res.status(403).json({ error: 'Ningún administrador puede cambiar la contraseña del usuario root.' });
      }
      if (account.role === 'admin' && !isCallerRoot && !isSelf) {
        return res.status(403).json({ error: 'Los administradores solo pueden cambiar su propia contraseña, no la de otros administradores.' });
      }
      const { salt, hash } = hashPassword(String(password));
      account.passwordHash = hash;
      account.salt = salt;
    }

    account.updatedAt = new Date().toISOString();
    accounts[idx] = account;
    await writeData(files.accounts, accounts);
    console.log(`👤 Usuario actualizado: ${account.email} → role=${account.role} por ${req.user?.email}`);
    res.json({ ok: true, user: sanitizeAccount(account), data: sanitizeAccount(account) });
  } catch (error) {
    console.error('updateUser error:', error.message);
    res.status(500).json({ error: 'Error actualizando el usuario: ' + error.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const accounts = await readData(files.accounts);
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const account = accounts[idx];

    const isTargetRoot = account.role === 'root' || account.email.toLowerCase() === ROOT_EMAIL || !!account.isRoot;
    const isCallerRoot = req.user?.isRoot || req.user?.role === 'root' || req.user?.email.toLowerCase() === ROOT_EMAIL;

    if (isTargetRoot) {
      return res.status(403).json({ error: 'No se puede eliminar la cuenta root del servidor.' });
    }

    if (account.email.toLowerCase() === req.user?.email.toLowerCase()) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }

    if (account.role === 'admin' && !isCallerRoot) {
      return res.status(403).json({ error: 'Solo el usuario root puede eliminar a otros administradores.' });
    }

    const adminCount = accounts.filter((a) => a.role === 'admin' || a.role === 'root').length;
    if (account.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'No puedes eliminar al último administrador del sistema.' });
    }

    accounts.splice(idx, 1);
    await writeData(files.accounts, accounts);
    console.log(`🗑️ Usuario eliminado: ${account.email} por ${req.user?.email}`);
    res.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error('deleteUser error:', error.message);
    res.status(500).json({ error: 'Error eliminando el usuario.' });
  }
}

export default {
  getAdminUsers,
  createUser,
  updateUser,
  deleteUser,
};
