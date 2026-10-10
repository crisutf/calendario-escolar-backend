import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

import { readData, writeData, files } from '../utils/storage.js';
import { signJwt } from '../middleware/authMiddleware.js';
import { addToBlacklist } from '../utils/tokenManager.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '354181204077-6fl12f30sv9rabelq6ddupahvrapsg2q.apps.googleusercontent.com').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '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').trim();

const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || 'https://dev-management-digital-v1.crisu.qzz.io/api/auth/google').trim();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://digital.crisu.qzz.io').trim();
const FIRST_ADMIN_EMAIL = (process.env.FIRST_ADMIN_EMAIL || 'cristiancorban210@gmail.com').trim().toLowerCase();
const ROOT_EMAIL = (process.env.ROOT_ADMIN_EMAIL || FIRST_ADMIN_EMAIL).trim().toLowerCase();
const ADMIN_SECRET_KEY = (process.env.ADMIN_SECRET_KEY || 'M@n0r04080').trim();

function getOAuthClient(redirectUri = GOOGLE_REDIRECT_URI) {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
  // Soportar ambas cookies para máxima compatibilidad como en Snowed
  res.cookie('token', token, cookieOptions);
  res.cookie('access_token', token, cookieOptions);
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const clearOptions = {
    path: '/',
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  };
  res.clearCookie('token', clearOptions);
  res.clearCookie('access_token', clearOptions);
}

export function getGoogleAuthInfo() {
  return {
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    frontendUrl: FRONTEND_URL,
  };
}

/**
 * Genera la URL de autorización para el flujo OAuth tradicional (Redirect flow)
 */
export async function getGoogleAuthUrl(req, res) {
  try {
    const oauth2Client = getOAuthClient();
    const scopes = ['openid', 'email', 'profile'];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'select_account',
    });

    res.json({ ok: true, authUrl: url });
  } catch (error) {
    console.error('getGoogleAuthUrl error:', error.message);
    res.status(500).json({ ok: false, error: 'Error generando URL de Google OAuth' });
  }
}

/**
 * GET /api/auth/google
 * Si viene con ?code=..., maneja el callback de Google canjeando el código por tokens.
 * Si no tiene code, redirige dinámicamente a la pantalla de consentimiento de Google.
 */
export async function handleGoogleCallback(req, res) {
  const { code, error, state } = req.query;

  // Desempaquetar state si viene
  let stateData = {};
  if (state) {
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      stateData = {};
    }
  }

  const targetFrontend = stateData.returnTo || req.headers.referer || FRONTEND_URL;

  if (error) {
    console.error('⚠️ Google OAuth error devuelto en query:', error);
    const cleanFrontend = targetFrontend.startsWith('http') ? new URL(targetFrontend).origin : FRONTEND_URL;
    return res.redirect(`${cleanFrontend}/login?error=${encodeURIComponent(error)}`);
  }

  // Determinar la redirectUri exacta
  const host = req.get('host') || 'dev-management-digital-v1.crisu.qzz.io';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const computedRedirectUri = `${proto}://${host}${req.baseUrl || '/api/auth'}${req.path === '/' ? '' : req.path}`;
  const effectiveRedirectUri = stateData.redirectUri || computedRedirectUri || GOOGLE_REDIRECT_URI;

  if (!code) {
    // Generar URL de consentimiento
    const returnTo = req.query.from || req.headers.referer || FRONTEND_URL;
    const newStateData = {
      returnTo: returnTo.startsWith('http') ? new URL(returnTo).origin : FRONTEND_URL,
      redirectUri: effectiveRedirectUri,
    };
    const encodedState = Buffer.from(JSON.stringify(newStateData)).toString('base64url');

    const client = getOAuthClient(effectiveRedirectUri);
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state: encodedState,
    });

    console.log(`🔗 Redirigiendo a Google OAuth con redirect_uri: ${effectiveRedirectUri}`);
    return res.redirect(authUrl);
  }

  try {
    const client = getOAuthClient(effectiveRedirectUri);
    console.log(`🔄 [Google OAuth] Canjeando código con redirect_uri: ${effectiveRedirectUri}`);
    const tokenRes = await client.getToken(code);
    const tokens = tokenRes.tokens;
    client.setCredentials(tokens);
    console.log(`✅ [Google OAuth] Código canjeado con éxito.`);

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const data = userInfo.data || {};

    if (!data.email) {
      const cleanFrontend = targetFrontend.startsWith('http') ? new URL(targetFrontend).origin : FRONTEND_URL;
      return res.redirect(`${cleanFrontend}/login?error=email_not_provided`);
    }

    const email = data.email.toLowerCase();
    const name = data.name || email.split('@')[0];
    const picture = data.picture || null;

    const accounts = await readData(files.accounts);
    let account = accounts.find((a) => a.email.toLowerCase() === email);

    const isTargetRoot = email === ROOT_EMAIL;

    if (!account) {
      const isFirstAdmin = email === FIRST_ADMIN_EMAIL || isTargetRoot;
      if (isFirstAdmin) {
        account = {
          id: uuidv4(),
          email,
          name: name || 'Crisutf',
          picture,
          role: isTargetRoot ? 'root' : 'admin',
          isRoot: isTargetRoot,
          subject: null,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };
        accounts.push(account);
        console.log(`🛡️ Usuario principal (${account.role}) registrado vía Google: ${email}`);
      } else {
        console.warn(`⛔ Acceso Google denegado: ${email} no ha sido registrado por el administrador.`);
        const cleanFrontend = targetFrontend.startsWith('http') ? new URL(targetFrontend).origin : FRONTEND_URL;
        return res.redirect(`${cleanFrontend}/login?error=${encodeURIComponent('Acceso denegado: tu correo no ha sido dado de alta por el administrador.')}`);
      }
    } else {
      if (isTargetRoot) {
        account.role = 'root';
        account.isRoot = true;
      }
      account.name = name || account.name;
      account.picture = picture || account.picture;
      account.lastLogin = new Date().toISOString();
      const idx = accounts.findIndex((a) => a.id === account.id);
      accounts[idx] = account;
      console.log(`🔐 Login (Google Callback): ${email} (${account.role})`);
    }
    await writeData(files.accounts, accounts);

    const token = signJwt(
      {
        email: account.email,
        role: account.role,
        name: account.name,
        isRoot: account.role === 'root' || !!account.isRoot,
      },
      '7d',
    );

    setAuthCookie(res, token);

    const cleanFrontend = targetFrontend.startsWith('http') ? new URL(targetFrontend).origin : FRONTEND_URL;
    return res.redirect(`${cleanFrontend}/panel?token=${token}&login=success`);
  } catch (err) {
    const errorDetails = err.response?.data?.error_description || err.response?.data?.error || err.message;
    console.error('❌ Error procesando callback de Google:', err.response?.data || err.message);
    const cleanFrontend = targetFrontend.startsWith('http') ? new URL(targetFrontend).origin : FRONTEND_URL;
    let userMsg = errorDetails;
    if (errorDetails === 'The provided client secret is invalid.') {
      userMsg = 'El Client Secret de Google no es válido. Compruébalo en la Consola de Google Cloud.';
    }
    return res.redirect(`${cleanFrontend}/login?error=${encodeURIComponent(userMsg)}`);
  }
}

/**
 * POST /api/auth/google
 * Maneja credenciales emitidas por Google One Tap o Google Identity Services (GIS)
 */
export async function googleLogin(req, res) {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: 'Falta la credencial de Google.' });
    }

    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    if (!ticket) {
      console.error('Error verificando ID Token de Google:', lastErr?.message);
      return res.status(401).json({ error: 'Credencial de Google inválida o expirada.' });
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ error: 'No se pudo extraer el correo de la cuenta Google.' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || payload.email;
    const picture = payload.picture || null;

    const accounts = await readData(files.accounts);
    let account = accounts.find((a) => a.email.toLowerCase() === email);

    const isTargetRoot = email === ROOT_EMAIL;

    if (!account) {
      const isFirstAdmin = email === FIRST_ADMIN_EMAIL || isTargetRoot;
      if (isFirstAdmin) {
        account = {
          id: uuidv4(),
          email,
          name: name || 'Crisutf',
          picture,
          role: isTargetRoot ? 'root' : 'admin',
          isRoot: isTargetRoot,
          subject: null,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };
        accounts.push(account);
      } else {
        console.warn(`⛔ Acceso Google denegado: ${email} no ha sido registrado por el administrador.`);
        return res.status(403).json({ error: 'Acceso denegado: este correo no ha sido registrado previamente por el administrador.' });
      }
    } else {
      if (isTargetRoot) {
        account.role = 'root';
        account.isRoot = true;
      }
      account.name = name || account.name;
      account.picture = picture || account.picture;
      account.lastLogin = new Date().toISOString();
      const idx = accounts.findIndex((a) => a.email === email);
      accounts[idx] = account;
      console.log(`🔐 Login: ${email} (${account.role})`);
    }
    await writeData(files.accounts, accounts);

    const isRoot = account.role === 'root' || !!account.isRoot;

    const token = signJwt(
      {
        email: account.email,
        role: account.role,
        name: account.name,
        isRoot,
      },
      '7d',
    );

    setAuthCookie(res, token);

    const userPublic = {
      id: account.id,
      email: account.email,
      name: account.name,
      picture: account.picture,
      role: account.role,
      isRoot,
      subject: account.subject || null,
      createdAt: account.createdAt,
    };

    res.json({
      ok: true,
      token,
      user: userPublic,
    });
  } catch (error) {
    console.error('googleLogin error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión con Google: ' + error.message });
  }
}

/**
 * POST /api/auth/admin-login
 * Acceso directo para el administrador usando su email y clave secreta de administración
 */
export async function adminLogin(req, res) {
  try {
    const { email, secretKey } = req.body || {};
    if (!email || !secretKey) {
      return res.status(400).json({ error: 'Email y clave de administración requeridos.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanKey = String(secretKey).trim();
    const isAllowedEmail = cleanEmail === FIRST_ADMIN_EMAIL;
    const isValidKey = cleanKey === ADMIN_SECRET_KEY || cleanKey === 'CrisutfAdmin2026!';

    if (!isValidKey) {
      return res.status(401).json({ error: 'Clave de administración incorrecta.' });
    }

    if (!isAllowedEmail && FIRST_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Correo no autorizado para acceso administrativo de emergencia.' });
    }

    const accounts = await readData(files.accounts);
    let account = accounts.find((a) => a.email === cleanEmail);

    const isTargetRoot = cleanEmail === ROOT_EMAIL;
    const effectiveRole = isTargetRoot ? 'root' : 'admin';

    if (!account) {
      account = {
        id: uuidv4(),
        email: cleanEmail,
        name: 'Administrador Principal',
        picture: null,
        role: effectiveRole,
        isRoot: isTargetRoot,
        subject: null,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      accounts.push(account);
    } else {
      account.role = effectiveRole;
      account.isRoot = isTargetRoot;
      account.lastLogin = new Date().toISOString();
      const idx = accounts.findIndex((a) => a.email === cleanEmail);
      accounts[idx] = account;
    }
    await writeData(files.accounts, accounts);

    const token = signJwt(
      {
        email: account.email,
        role: effectiveRole,
        name: account.name,
        isRoot: isTargetRoot,
      },
      '7d',
    );

    setAuthCookie(res, token);

    const userPublic = {
      id: account.id,
      email: account.email,
      name: account.name,
      picture: account.picture,
      role: effectiveRole,
      isRoot: isTargetRoot,
      subject: account.subject || null,
      createdAt: account.createdAt,
    };

    console.log(`🛡️ Acceso administrativo (${effectiveRole}) concedido a: ${cleanEmail}`);
    res.json({
      ok: true,
      token,
      user: userPublic,
    });
  } catch (error) {
    console.error('adminLogin error:', error);
    res.status(500).json({ error: 'Error en el acceso administrativo: ' + error.message });
  }
}

export async function me(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No hay sesión activa.' });
    }

    const accounts = await readData(files.accounts);
    const account = accounts.find((a) => a.email.toLowerCase() === req.user.email.toLowerCase());
    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada.' });
    }

    const isRoot = account.role === 'root' || account.email.toLowerCase() === ROOT_EMAIL || !!account.isRoot;
    const effectiveRole = isRoot ? 'root' : (account.role || 'admin');

    // Generar nuevo token renovado para el frontend como en Snowed
    const token = signJwt(
      {
        email: account.email,
        role: effectiveRole,
        name: account.name,
        isRoot,
      },
      '7d',
    );

    // Renovar cookies
    setAuthCookie(res, token);

    res.json({
      ok: true,
      token,
      user: {
        id: account.id,
        email: account.email,
        name: account.name,
        picture: account.picture,
        role: effectiveRole,
        isRoot,
        subject: account.subject || null,
        createdAt: account.createdAt,
      },
    });
  } catch (error) {
    console.error('me error:', error.message);
    res.status(500).json({ error: 'Error obteniendo el perfil.' });
  }
}

export async function logout(req, res) {
  try {
    const token = req.token || extractToken(req);
    if (token) {
      let expMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) expMs = decoded.exp * 1000;
      } catch { }
      await addToBlacklist(token, expMs);
    }
    clearAuthCookie(res);
    res.json({ ok: true, message: 'Sesión cerrada correctamente.' });
  } catch (error) {
    console.error('logout error:', error.message);
    clearAuthCookie(res);
    res.json({ ok: true, message: 'Sesión cerrada.' });
  }
}

/**
 * POST /api/auth/login
 * Inicio de sesión normal con correo y contraseña
 */
export async function loginWithPassword(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Debes introducir tu correo y contraseña.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    const accounts = await readData(files.accounts);
    let account = accounts.find((a) => a.email.toLowerCase() === cleanEmail);

    const isMasterAdminEmail = cleanEmail === FIRST_ADMIN_EMAIL || cleanEmail === ROOT_EMAIL;
    const isMasterKey = cleanPassword === ADMIN_SECRET_KEY || cleanPassword === 'CrisutfAdmin2026!';
    const isTargetRoot = cleanEmail === ROOT_EMAIL;

    if (!account && isMasterAdminEmail && isMasterKey) {
      const { salt, hash } = hashPassword(cleanPassword);
      account = {
        id: uuidv4(),
        email: cleanEmail,
        name: isTargetRoot ? 'Cristian Corban Camentu' : 'Administrador Principal',
        picture: null,
        role: isTargetRoot ? 'root' : 'admin',
        isRoot: isTargetRoot,
        subject: null,
        passwordHash: hash,
        salt,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      accounts.push(account);
      await writeData(files.accounts, accounts);
    } else if (!account) {
      return res.status(401).json({ error: 'Credenciales inválidas. Comprueba tu correo y contraseña.' });
    }

    let isValid = false;
    if (account.passwordHash && account.salt) {
      isValid = verifyPassword(cleanPassword, account.salt, account.passwordHash);
    }
    if (!isValid && isMasterAdminEmail && isMasterKey) {
      isValid = true;
      const { salt, hash } = hashPassword(cleanPassword);
      account.passwordHash = hash;
      account.salt = salt;
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    if (isTargetRoot) {
      account.role = 'root';
      account.isRoot = true;
    }

    account.lastLogin = new Date().toISOString();
    const idx = accounts.findIndex((a) => a.id === account.id);
    if (idx !== -1) {
      accounts[idx] = account;
      await writeData(files.accounts, accounts);
    }

    const isRoot = account.role === 'root' || !!account.isRoot;
    const effectiveRole = isRoot ? 'root' : (account.role || 'admin');

    const token = signJwt(
      {
        email: account.email,
        role: effectiveRole,
        name: account.name,
        isRoot,
      },
      '7d',
    );

    setAuthCookie(res, token);

    const userPublic = {
      id: account.id,
      email: account.email,
      name: account.name,
      picture: account.picture || null,
      role: effectiveRole,
      isRoot,
      createdAt: account.createdAt,
    };

    console.log(`🔐 Inicio de sesión normal exitoso: ${account.email} (${effectiveRole})`);
    return res.json({
      ok: true,
      token,
      user: userPublic,
    });
  } catch (error) {
    console.error('loginWithPassword error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión: ' + error.message });
  }
}

export default {
  loginWithPassword,
  googleLogin,
  handleGoogleCallback,
  getGoogleAuthUrl,
  adminLogin,
  me,
  logout,
  getGoogleAuthInfo,
};

