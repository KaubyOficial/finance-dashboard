// Persists OAuth refresh tokens (encrypted) keyed by the authorized identity.
import { encrypt, decrypt } from './crypto.js';

export function saveToken(db, { account, email, refreshToken, scope }) {
  db.prepare(`
    INSERT INTO oauth_tokens (account, email, refresh_token_enc, scope, obtained_at, revoked)
    VALUES (@account, @email, @enc, @scope, datetime('now'), 0)
    ON CONFLICT(account) DO UPDATE SET
      email = excluded.email,
      refresh_token_enc = excluded.refresh_token_enc,
      scope = excluded.scope,
      obtained_at = datetime('now'),
      revoked = 0
  `).run({ account, email: email || null, enc: encrypt(refreshToken), scope: scope || null });
}

export function listAccounts(db) {
  return db
    .prepare('SELECT account, email, scope, obtained_at, last_refresh_at, revoked FROM oauth_tokens ORDER BY account')
    .all();
}

/** Returns the decrypted refresh token for an account, or null. */
export function getRefreshToken(db, account) {
  const row = db.prepare('SELECT refresh_token_enc, revoked FROM oauth_tokens WHERE account = ?').get(account);
  if (!row || row.revoked) return null;
  return decrypt(row.refresh_token_enc);
}

export function markRefreshed(db, account) {
  db.prepare("UPDATE oauth_tokens SET last_refresh_at = datetime('now') WHERE account = ?").run(account);
}

export function markRevoked(db, account) {
  db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE account = ?').run(account);
}
