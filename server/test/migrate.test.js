import { describe, it, expect } from 'vitest';
import { openInMemory } from '../src/db/index.js';
import { runMigrations, listMigrations } from '../src/db/migrate.js';

describe('migration runner', () => {
  it('creates the schema from scratch', () => {
    const db = openInMemory();
    const applied = runMigrations(db);
    expect(applied.length).toBe(listMigrations().length);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    for (const t of ['channels', 'revenue_daily', 'sales', 'costs', 'fx_rates', 'sync_log', 'oauth_tokens', 'meta']) {
      expect(tables).toContain(t);
    }
  });

  it('is idempotent — running twice applies nothing new', () => {
    const db = openInMemory();
    runMigrations(db);
    const second = runMigrations(db);
    expect(second).toEqual([]);
  });
});
