// Helpers to record sync runs in the sync_log table (Settings/Sync page + S6.3).
export function startRun(db, source, scope = null) {
  const info = db
    .prepare("INSERT INTO sync_log (source, scope, status) VALUES (?, ?, 'running')")
    .run(source, scope);
  return info.lastInsertRowid;
}

export function updateCursor(db, id, cursor) {
  db.prepare('UPDATE sync_log SET cursor = ? WHERE id = ?').run(cursor, id);
}

export function finishRun(db, id, { status, rowsUpserted = 0, message = null, detail = null } = {}) {
  db.prepare(
    "UPDATE sync_log SET status = ?, rows_upserted = ?, message = ?, detail = ?, finished_at = datetime('now') WHERE id = ?"
  ).run(status, rowsUpserted, message, detail, id);
}

/** Last run per source, for freshness badges (S6.3). */
export function lastRuns(db) {
  return db
    .prepare(
      `SELECT s.* FROM sync_log s
       JOIN (SELECT source, MAX(id) AS maxid FROM sync_log GROUP BY source) m
         ON s.source = m.source AND s.id = m.maxid
       ORDER BY s.source`
    )
    .all();
}

export function recentRuns(db, limit = 50) {
  return db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit);
}
