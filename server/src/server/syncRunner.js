// In-process "Sync now" runner (S5.4). Guards against overlapping runs with the
// file lock and exposes progress state for polling.
import { runSyncAll } from '../sync/syncAll.js';
import { acquireLock } from '../util/lock.js';
import { log } from '../logger.js';

let state = { running: false, startedAt: null, finishedAt: null, lastResult: null, error: null };

export function getSyncState() {
  return state;
}

/** Kick off a sync in the background. Returns immediately. */
export function triggerSync(db, { mode = 'incremental', only } = {}) {
  if (state.running) return { started: false, reason: 'sync já em andamento' };
  const lock = acquireLock();
  if (!lock.ok) return { started: false, reason: 'outra execução detém o lock', holder: lock.holder };

  state = { running: true, startedAt: new Date().toISOString(), finishedAt: null, lastResult: null, error: null };
  runSyncAll(db, { mode, only })
    .then((r) => {
      state = { ...state, running: false, finishedAt: new Date().toISOString(), lastResult: r };
    })
    .catch((e) => {
      log.error(`Sync now falhou: ${e.message}`);
      state = { ...state, running: false, finishedAt: new Date().toISOString(), error: e.message };
    })
    .finally(() => lock.release());

  return { started: true };
}
