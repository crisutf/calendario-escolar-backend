import { readData, writeData, files } from './storage.js';

const BLACKLIST_CLEAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function initTokenBlacklist() {
  try {
    const data = await readData(files.tokenBlacklist);
    if (!data || !Array.isArray(data.tokens)) {
      await writeData(files.tokenBlacklist, { tokens: [] });
    }
  } catch (err) {
    console.error('Error inicializando token blacklist:', err.message);
  }

  setInterval(async () => {
    try {
      const now = Date.now();
      const list = await readData(files.tokenBlacklist);
      if (list && Array.isArray(list.tokens)) {
        const before = list.tokens.length;
        list.tokens = list.tokens.filter((t) => (t.expiresAt || 0) > now);
        if (list.tokens.length !== before) {
          await writeData(files.tokenBlacklist, list);
          console.log(`🧹 Limpiada blacklist tokens: ${before} → ${list.tokens.length}`);
        }
      }
    } catch (err) {
      console.error('Error limpiando token blacklist:', err.message);
    }
  }, BLACKLIST_CLEAN_INTERVAL_MS).unref?.();
  console.log('🔐 Token blacklist inicializada');
}

export async function addToBlacklist(token, expiresAtMs) {
  try {
    let data = await readData(files.tokenBlacklist);
    if (!data || !Array.isArray(data.tokens)) {
      data = { tokens: [] };
    }
    const exp = expiresAtMs || (Date.now() + 24 * 60 * 60 * 1000);
    data.tokens.push({ token, expiresAt: exp, addedAt: Date.now() });
    // Limpiar tokens expirados automáticamente
    const now = Date.now();
    data.tokens = data.tokens.filter((t) => (t.expiresAt || 0) > now);
    await writeData(files.tokenBlacklist, data);
    return true;
  } catch (err) {
    console.error('Error añadiendo token a blacklist:', err.message);
    return false;
  }
}

export async function isTokenBlacklisted(token) {
  try {
    if (!token) return false;
    const data = await readData(files.tokenBlacklist);
    if (!data || !Array.isArray(data.tokens)) return false;
    return data.tokens.some((t) => t.token === token);
  } catch {
    return false;
  }
}

export default {
  initTokenBlacklist,
  addToBlacklist,
  isTokenBlacklisted,
};
