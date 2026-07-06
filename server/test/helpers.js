// Shared test scaffolding: a migrated in-memory DB + a fake fetch transport.
import { openInMemory } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { _setKeyForTests } from '../src/auth/crypto.js';
import crypto from 'node:crypto';

_setKeyForTests(crypto.randomBytes(32)); // deterministic-free, avoids writing a keyfile

export function makeDb({ withConfig = true } = {}) {
  const db = openInMemory();
  runMigrations(db);
  if (withConfig) syncChannelsFromConfig(db);
  return db;
}

/** Build a fake fetch-like transport from a handler(url, opts) => {status, body}. */
export function fakeTransport(handler) {
  return async (url, opts) => {
    const { status = 200, body = {} } = handler(url, opts) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
}
