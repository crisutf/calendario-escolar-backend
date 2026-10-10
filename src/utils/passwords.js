import crypto from 'node:crypto';

/**
 * Genera un salt y hash criptográfico PBKDF2 seguro para contraseñas
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

/**
 * Verifica si la contraseña dada coincide con el salt y hash almacenados
 */
export function verifyPassword(password, salt, storedHash) {
  if (!password || !salt || !storedHash) return false;
  const hash = crypto.pbkdf2Sync(String(password), salt, 10000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

export default {
  hashPassword,
  verifyPassword,
};
