import jwt from 'jsonwebtoken';
import { isTokenBlacklisted } from '../utils/tokenManager.js';
import { readData, files } from '../utils/storage.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me-calendario-escolar-2026';

const ROOT_EMAIL = (process.env.ROOT_ADMIN_EMAIL || process.env.FIRST_ADMIN_EMAIL || 'cristiancorban210@gmail.com').trim().toLowerCase();

export function extractToken(req) {
  let token = null;

  // 1. Prioridad: Cabecera Authorization (Bearer ...) tal como se hace en Snowed
  if (req.headers && req.headers.authorization) {
    const header = req.headers.authorization.trim();
    if (header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else {
      token = header;
    }
  }

  // 2. Si no está en cabecera, buscar en cookies (token o access_token)
  if (!token && req.cookies) {
    token = req.cookies.token || req.cookies.access_token;
  }

  return token;
}

export async function protect(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token revocado. Vuelve a iniciar sesión.' });
    }
    const accounts = await readData(files.accounts);
    const account = accounts.find((a) => a.email.toLowerCase() === (decoded.email || '').toLowerCase());
    if (!account) {
      return res.status(401).json({ error: 'Cuenta no encontrada.' });
    }

    const isRoot = account.role === 'root' || account.email.toLowerCase() === ROOT_EMAIL || !!account.isRoot;
    const effectiveRole = isRoot ? 'root' : (account.role || 'admin');

    req.token = token;
    req.tokenExp = decoded.exp ? decoded.exp * 1000 : Date.now() + 7 * 24 * 3600 * 1000;
    req.user = {
      id: account.id,
      email: account.email,
      name: account.name,
      picture: account.picture,
      role: effectiveRole,
      isRoot,
      subject: account.subject || null,
      createdAt: account.createdAt,
    };
    next();
  } catch (error) {
    console.error('Protect middleware error:', error.message);
    res.status(500).json({ error: 'Error interno de autenticación.' });
  }
}

export function tutorOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autorizado.' });
  if (req.user.role === 'admin' || req.user.role === 'root' || req.user.isRoot) return next();
  return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol administrador.' });
}

export function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autorizado.' });
  if (req.user.role === 'admin' || req.user.role === 'root' || req.user.isRoot) return next();
  return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol administrador o root.' });
}

export function signJwt(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export const JWT_CONFIG = { secret: JWT_SECRET };

export default {
  protect,
  tutorOnly,
  adminOnly,
  extractToken,
  signJwt,
  JWT_CONFIG,
};
