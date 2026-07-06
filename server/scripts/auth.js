#!/usr/bin/env node
// CLI: authorize a Google account. Usage: npm run auth -- --account <nome>
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { authorizeAccount } from '../src/auth/google.js';
import { googleConfigured } from '../src/env.js';
import { log } from '../src/logger.js';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const account = argValue('--account');
if (!account) {
  console.error('Uso: npm run auth -- --account <nome-da-conta>');
  process.exit(1);
}
if (!googleConfigured()) {
  console.error('GOOGLE_CLIENT_ID/SECRET ausentes no .env. Ver docs/setup-google.md.');
  process.exit(1);
}

const db = getDb();
runMigrations(db);
try {
  const r = await authorizeAccount(db, account);
  log.info(`✅ Conta "${r.account}" autorizada${r.email ? ` (${r.email})` : ''}.`);
  process.exit(0);
} catch (e) {
  log.error(`Autorização falhou: ${e.message}`);
  process.exit(1);
}
