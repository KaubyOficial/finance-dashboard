import { describe, it, expect } from 'vitest';
import { openInMemory } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { resolveAccountForChannel } from '../src/sync/syncAll.js';

function freshDb() {
  const db = openInMemory();
  runMigrations(db);
  return db;
}

function addToken(db, { account, email, revoked = 0 }) {
  db.prepare(
    `INSERT INTO oauth_tokens (account, email, refresh_token_enc, scope, obtained_at, revoked)
     VALUES (?, ?, 'enc', 'scope', datetime('now'), ?)`
  ).run(account, email ?? null, revoked);
}

describe('resolveAccountForChannel', () => {
  // Regression: a delegated Brand Account channel has no email of its own, so its token
  // carries the *delegate's* email — the very same email as the delegate's own channel.
  // Resolving by email alone hit two rows and returned an arbitrary one, silently syncing
  // one channel's revenue under the other.
  it('binds a delegated Brand Account channel to its own token, not the delegate\'s other channel', () => {
    const db = freshDb();
    addToken(db, { account: 'orchestral_a', email: 'kaue.r02contato@gmail.com' });
    addToken(db, { account: 'satisfying_visuals', email: 'kaue.r02contato@gmail.com' });

    const shared = 'kaue.r02contato@gmail.com';
    expect(resolveAccountForChannel(db, { id: 'satisfying_visuals', google_account: shared })).toBe(
      'satisfying_visuals'
    );
    expect(resolveAccountForChannel(db, { id: 'orchestral_a', google_account: shared })).toBe('orchestral_a');
  });

  // The config may still name the channel's human owner (the primary owner of the Brand
  // Account) rather than the delegate that actually holds the token.
  it('prefers the per-channel token even when google_account names a different identity', () => {
    const db = freshDb();
    addToken(db, { account: 'redef_fr', email: 'financefuteeoficial@gmail.com' });
    addToken(db, { account: 'satisfying_visuals', email: 'kaue.r02contato@gmail.com' });

    expect(
      resolveAccountForChannel(db, { id: 'satisfying_visuals', google_account: 'kaue.s02contato@gmail.com' })
    ).toBe('satisfying_visuals');
  });

  it('still resolves by email for channels authorized under their own account name', () => {
    const db = freshDb();
    addToken(db, { account: 'redef_fr', email: 'financefuteeoficial@gmail.com' });

    expect(resolveAccountForChannel(db, { id: 'redef_fr', google_account: 'financefuteeoficial@gmail.com' })).toBe(
      'redef_fr'
    );
  });

  it('ignores a revoked per-channel token and falls back to the email match', () => {
    const db = freshDb();
    addToken(db, { account: 'satisfying_visuals', email: 'kaue.r02contato@gmail.com', revoked: 1 });
    addToken(db, { account: 'orchestral_a', email: 'kaue.r02contato@gmail.com' });

    expect(
      resolveAccountForChannel(db, { id: 'satisfying_visuals', google_account: 'kaue.r02contato@gmail.com' })
    ).toBe('orchestral_a');
  });

  it('returns null when nothing is authorized', () => {
    const db = freshDb();
    expect(resolveAccountForChannel(db, { id: 'satisfying_visuals', google_account: 'x@gmail.com' })).toBeNull();
  });
});
