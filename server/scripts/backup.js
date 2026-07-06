#!/usr/bin/env node
// CLI: back up finance.db (14-day rotation). Run at the end of each sync (S6.4).
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/db/index.js';
import { backupDir, dbPath, ensureDataDirs } from '../src/paths.js';
import { log } from '../src/logger.js';

const RETAIN = 14;

ensureDataDirs();
const db = getDb();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(backupDir, `finance-${stamp}.db`);

// better-sqlite3 online backup (consistent even with WAL).
await db.backup(dest);
log.info(`Backup criado: ${dest}`);

// Rotate: keep the newest RETAIN files.
const files = fs
  .readdirSync(backupDir)
  .filter((f) => f.startsWith('finance-') && f.endsWith('.db'))
  .sort()
  .reverse();
for (const old of files.slice(RETAIN)) {
  fs.rmSync(path.join(backupDir, old), { force: true });
  log.info(`Backup antigo removido: ${old}`);
}
if (!fs.existsSync(dbPath)) log.warn('Atenção: finance.db principal não encontrado.');
