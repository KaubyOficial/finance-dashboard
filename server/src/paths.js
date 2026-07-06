// Central path resolution. Everything hangs off the repo root so the app works
// no matter the current working directory (npm scripts, Task Scheduler, tests).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url)); // server/src
export const serverRoot = path.resolve(here, '..'); // server/
export const repoRoot = path.resolve(serverRoot, '..'); // finance-dashboard/

export const configDir = path.join(repoRoot, 'config');
export const channelsConfigPath = path.join(configDir, 'channels.json');
export const envPath = path.join(repoRoot, '.env');

// FINANCE_DATA_DIR lets tests/e2e isolate the DB in a temp dir.
export const dataDir = process.env.FINANCE_DATA_DIR
  ? path.resolve(process.env.FINANCE_DATA_DIR)
  : path.join(serverRoot, 'data');
export const dbPath = path.join(dataDir, 'finance.db');
export const syncLogDir = path.join(dataDir, 'sync-log');
export const backupDir = path.join(dataDir, 'backups');
export const lockFile = path.join(dataDir, 'sync.lock');
export const migrationsDir = path.join(serverRoot, 'src', 'db', 'migrations');

export function ensureDataDirs() {
  for (const d of [dataDir, syncLogDir, backupDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
