// Cross-process lock file so two syncs never overlap (S6.1). Stale locks
// (older than `staleMs`, e.g. a crashed run) are reclaimed.
import fs from 'node:fs';
import { lockFile, ensureDataDirs } from '../paths.js';

export function acquireLock({ file = lockFile, staleMs = 30 * 60_000 } = {}) {
  ensureDataDirs();
  if (fs.existsSync(file)) {
    try {
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      const age = Date.now() - (info.at || 0);
      if (age < staleMs) {
        return { ok: false, holder: info };
      }
    } catch {
      /* corrupt lock → treat as stale */
    }
  }
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }));
  return {
    ok: true,
    release() {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}
