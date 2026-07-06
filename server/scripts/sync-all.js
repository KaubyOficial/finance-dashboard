#!/usr/bin/env node
// CLI / headless: run a full sync. Usage:
//   npm run sync-all                 (incremental: YT 35d, Hotmart 90d, FX)
//   npm run sync-all -- --backfill   (lifetime backfill)
//   npm run sync-all -- --only fx,hotmart
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { runSyncAll } from '../src/sync/syncAll.js';
import { acquireLock } from '../src/util/lock.js';
import { attachLogFile, detachLogFile, log } from '../src/logger.js';
import { syncLogDir, ensureDataDirs } from '../src/paths.js';
import path from 'node:path';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

ensureDataDirs();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
attachLogFile(path.join(syncLogDir, `sync-${stamp}.log`));

const mode = process.argv.includes('--backfill') ? 'backfill' : 'incremental';
const onlyArg = argValue('--only');
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()) : undefined;

const lock = acquireLock();
if (!lock.ok) {
  log.warn('Outra execução de sync já está rodando (lock ativo). Saindo limpo.');
  detachLogFile();
  process.exit(0);
}

const db = getDb();
runMigrations(db);
syncChannelsFromConfig(db);

try {
  const r = await runSyncAll(db, { mode, only });
  log.info(`Sync ${r.status}: ${r.rows} linhas. Erros: ${r.errors.length}`);
  lock.release();
  detachLogFile();
  process.exit(r.status === 'error' ? 1 : 0);
} catch (e) {
  log.error(`Sync abortou: ${e.message}`);
  lock.release();
  detachLogFile();
  process.exit(1);
}
