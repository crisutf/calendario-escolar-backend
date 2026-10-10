import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

export const files = {
  events: 'events.json',
  accounts: 'accounts.json',
  announcements: 'announcements.json',
  settings: 'settings.json',
  tokenBlacklist: 'token_blacklist.json',
};

const DEFAULT_FILES = {
  events: [],
  accounts: [],
  announcements: [],
  settings: { maintenance: { mode: false, message: '' } },
  tokenBlacklist: { tokens: [] },
};

export async function initStorage() {
  try {
    await fs.ensureDir(DATA_DIR);
    for (const [key, fileName] of Object.entries(files)) {
      const filePath = path.join(DATA_DIR, fileName);
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        const defaultVal = DEFAULT_FILES[key];
        await fs.writeJson(filePath, defaultVal, { spaces: 2 });
        console.log(`📁 Creado archivo data/${fileName}`);
      }
    }
  } catch (error) {
    console.error('❌ Error inicializando almacenamiento:', error.message);
    throw error;
  }
}

export async function readData(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  try {
    return await fs.readJson(filePath);
  } catch (error) {
    console.warn(`⚠️ Archivo ${fileName} corrupto o vacío, restaurando valor por defecto.`);
    const key = Object.keys(files).find((k) => files[k] === fileName);
    const defaultValue = DEFAULT_FILES[key];
    await writeData(fileName, defaultValue);
    return defaultValue;
  }
}

export async function writeData(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeJson(filePath, data, { spaces: 2 });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function getDataDirSize() {
  try {
    let totalBytes = 0;
    const entries = await fs.readdir(DATA_DIR);
    for (const entry of entries) {
      const entryPath = path.join(DATA_DIR, entry);
      try {
        const s = await fs.stat(entryPath);
        if (s.isFile()) totalBytes += s.size;
      } catch {}
    }
    return formatBytes(totalBytes);
  } catch {
    return 'N/A';
  }
}

export async function getDataDirFileSizes() {
  try {
    const result = {};
    const entries = await fs.readdir(DATA_DIR);
    for (const entry of entries) {
      const entryPath = path.join(DATA_DIR, entry);
      try {
        const s = await fs.stat(entryPath);
        if (s.isFile()) result[entry] = formatBytes(s.size);
      } catch {}
    }
    return result;
  } catch {
    return {};
  }
}

export default {
  initStorage,
  readData,
  writeData,
  getDataDirSize,
  getDataDirFileSizes,
  files,
};
