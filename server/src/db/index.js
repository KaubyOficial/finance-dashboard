// SQLite via Node's built-in `node:sqlite` (no native build needed on Node 22+).
// A thin adapter mimics the better-sqlite3 surface the codebase uses:
//   db.prepare(sql).run/get/all, db.exec, db.pragma, db.transaction, db.backup.
// Named-parameter binding tolerates missing keys (→ null) and ignores extras,
// matching the leniency the call sites assume.
import { DatabaseSync } from 'node:sqlite';
import { dbPath, ensureDataDirs } from '../paths.js';

function normalizeValue(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

class Stmt {
  constructor(stmt, sql) {
    this.stmt = stmt;
    this.names = [...new Set((sql.match(/[@:$](\w+)/g) || []).map((s) => s.slice(1)))];
    try {
      stmt.setAllowUnknownNamedParameters(true);
    } catch {
      /* older runtimes */
    }
  }

  _bind(args) {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const obj = args[0];
      const full = {};
      for (const n of this.names) full[n] = normalizeValue(obj[n]);
      return [full];
    }
    return args.map(normalizeValue);
  }

  run(...args) {
    return this.stmt.run(...this._bind(args));
  }
  get(...args) {
    return this.stmt.get(...this._bind(args));
  }
  all(...args) {
    return this.stmt.all(...this._bind(args));
  }
}

class Db {
  constructor(sqlite) {
    this._db = sqlite;
  }
  prepare(sql) {
    return new Stmt(this._db.prepare(sql), sql);
  }
  exec(sql) {
    this._db.exec(sql);
    return this;
  }
  pragma(expr) {
    // Only used to SET pragmas here; ignore the (rarely-needed) return value.
    this._db.exec(`PRAGMA ${expr};`);
  }
  transaction(fn) {
    const db = this._db;
    return (...args) => {
      db.exec('BEGIN');
      try {
        const r = fn(...args);
        db.exec('COMMIT');
        return r;
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      }
    };
  }
  /** Consistent copy of the DB (WAL-safe) via VACUUM INTO. */
  async backup(dest) {
    const escaped = String(dest).replace(/'/g, "''");
    this._db.exec(`VACUUM INTO '${escaped}'`);
  }
  close() {
    this._db.close();
  }
}

let db = null;

export function getDb() {
  if (db) return db;
  ensureDataDirs();
  db = new Db(new DatabaseSync(dbPath));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function openInMemory() {
  const mem = new Db(new DatabaseSync(':memory:'));
  mem.pragma('foreign_keys = ON');
  return mem;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getMeta(database, key) {
  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(database, key, value) {
  database
    .prepare(`INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value == null ? null : String(value));
}
