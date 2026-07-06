// At-rest encryption for OAuth refresh tokens (S7.4). AES-256-GCM.
// Key precedence: FINANCE_ENCRYPTION_KEY (base64, 32 bytes) → a machine-local
// keyfile auto-generated under server/data/ (gitignored). Either way, refresh
// tokens are never stored in plaintext.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, ensureDataDirs } from '../paths.js';
import { env } from '../env.js';

const KEYFILE = path.join(dataDir, '.keyfile');

let cachedKey = null;

function resolveKey() {
  if (cachedKey) return cachedKey;
  if (env.encryptionKey) {
    const buf = Buffer.from(env.encryptionKey, 'base64');
    if (buf.length !== 32) {
      throw new Error('FINANCE_ENCRYPTION_KEY deve ser 32 bytes em base64 (ver .env.example)');
    }
    cachedKey = buf;
    return buf;
  }
  ensureDataDirs();
  if (fs.existsSync(KEYFILE)) {
    cachedKey = Buffer.from(fs.readFileSync(KEYFILE, 'utf8').trim(), 'base64');
  } else {
    const buf = crypto.randomBytes(32);
    fs.writeFileSync(KEYFILE, buf.toString('base64'), { mode: 0o600 });
    cachedKey = buf;
  }
  return cachedKey;
}

/** Encrypt a UTF-8 string → compact "iv:tag:ciphertext" base64 triple. */
export function encrypt(plaintext) {
  const key = resolveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Decrypt a value produced by encrypt(). Throws on tamper/wrong key. */
export function decrypt(blob) {
  const key = resolveKey();
  const [ivB64, tagB64, ctB64] = String(blob).split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('token criptografado malformado');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Test seam: force a specific key (used by unit tests). */
export function _setKeyForTests(buf) {
  cachedKey = buf;
}
