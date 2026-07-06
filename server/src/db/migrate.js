// Simple numbered-file migration runner. Idempotent: tracks applied files in a
// `_migrations` table, so running twice is a no-op (S0.2 AC).
import fs from 'node:fs';
import path from 'node:path';
import { migrationsDir } from '../paths.js';

function ensureMigrationsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

/** List *.sql migration files in lexical (numbered) order. */
export function listMigrations() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Apply all pending migrations against `db`. Returns the list of names applied
 * *this run* (empty if the DB was already up to date).
 */
export function runMigrations(db) {
  ensureMigrationsTable(db);
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const pending = listMigrations().filter((f) => !applied.has(f));
  const done = [];
  const record = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      record.run(file);
    });
    tx();
    done.push(file);
  }
  return done;
}
