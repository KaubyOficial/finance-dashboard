// Freshness, provenance and integration health for the Settings/Sync page and
// the "dados até DD/MM" badges (S6.3, S5.4).
import { lastRuns } from './sync/syncLog.js';
import { listAccounts } from './auth/tokenStore.js';
import { todayUTC, todayLA, daysBetween } from './util/dates.js';

export function dataFreshness(db) {
  const ytMax = db.prepare('SELECT MAX(date) d FROM revenue_daily').get()?.d || null;
  const hmMax = db.prepare('SELECT MAX(order_date) d FROM sales').get()?.d || null;
  const fxMax = db.prepare("SELECT MAX(date) d FROM fx_rates").get()?.d || null;
  const runs = Object.fromEntries(lastRuns(db).map((r) => [r.source, r]));
  return {
    youtube: { dataUntil: ytMax, lastRun: runs.youtube || null, provisionalDays: db.prepare('SELECT COUNT(*) c FROM revenue_daily WHERE provisional = 1').get().c },
    hotmart: {
      dataUntil: hmMax,
      lastRun: runs.hotmart || null,
      staleHours: hmMax ? null : null,
      stale: hmStale(db),
    },
    fx: {
      dataUntil: fxMax,
      lastRun: runs.fx || null,
      stale: fxMax ? daysBetween(fxMax, todayUTC()) > 4 : true,
      // Latest rate set actually used by the engine (EUR-based: 1 EUR = rate quote).
      latest: fxMax
        ? Object.fromEntries(
            db.prepare("SELECT quote, rate FROM fx_rates WHERE date = ? AND base = 'EUR'").all(fxMax).map((r) => [r.quote, r.rate])
          )
        : null,
    },
    all: runs.all || null,
    today: { utc: todayUTC(), la: todayLA() },
  };
}

function hmStale(db) {
  const last = db.prepare("SELECT finished_at FROM sync_log WHERE source='hotmart' AND status='ok' ORDER BY id DESC LIMIT 1").get();
  if (!last?.finished_at) return true;
  const hours = (Date.now() - Date.parse(last.finished_at + 'Z')) / 3_600_000;
  return hours > 48;
}

export function tokenStatus(db) {
  return listAccounts(db).map((a) => ({
    account: a.account,
    email: a.email,
    revoked: !!a.revoked,
    obtainedAt: a.obtained_at,
    lastRefreshAt: a.last_refresh_at,
    daysSinceRefresh: a.last_refresh_at ? Math.floor((Date.now() - Date.parse(a.last_refresh_at + 'Z')) / 86_400_000) : null,
  }));
}

/** True if the whole app has synced successfully at least once in ~2 days (S6.2). */
export function syncHealthy(db) {
  const last = db.prepare("SELECT finished_at FROM sync_log WHERE source IN ('all','youtube','hotmart','fx') AND status IN ('ok','partial') ORDER BY id DESC LIMIT 1").get();
  if (!last?.finished_at) return false;
  const hours = (Date.now() - Date.parse(last.finished_at + 'Z')) / 3_600_000;
  return hours < 48;
}
