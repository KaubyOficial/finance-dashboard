// YouTube Analytics revenue sync (Epic 1). Pure helpers (mapping, chunk planning,
// upsert, error classification) are separated from network so they unit-test
// without hitting Google (S1.5). `transport` mirrors fetch(url, opts).

import { addDays, chunkDateRange, daysBetween, minDate, todayLA } from '../util/dates.js';
import { startRun, updateCursor, finishRun } from './syncLog.js';
import { log } from '../logger.js';

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

const METRICS = ['estimatedRevenue', 'estimatedAdRevenue', 'grossRevenue', 'views', 'estimatedMinutesWatched', 'cpm'];

// Data is capped at D-2 (YT lag ~48h — R3); the last 3 stored days are provisional.
export const REVENUE_LAG_DAYS = 2;
export const PROVISIONAL_DAYS = 3;
export const SLIDING_WINDOW_DAYS = 35;
export const BACKFILL_CHUNK_DAYS = 90;

const defaultTransport = (url, opts) => fetch(url, opts);

/** Map an HTTP status to an actionable, retryable-or-not error kind. */
export function classifyYtError(status) {
  if (status === 401) return { kind: 'auth', retryable: false, message: 'token inválido/expirado (401)' };
  if (status === 403) return { kind: 'forbidden', retryable: false, message: 'sem acesso monetário/permissão (403)' };
  if (status === 429) return { kind: 'rate', retryable: true, message: 'quota/rate limit (429)' };
  if (status >= 500) return { kind: 'server', retryable: true, message: `erro do servidor Google (${status})` };
  return { kind: 'other', retryable: false, message: `HTTP ${status}` };
}

/** Turn the Analytics {columnHeaders, rows} payload into daily revenue objects. */
export function mapRevenueRows(payload) {
  const headers = (payload.columnHeaders || []).map((h) => h.name);
  const idx = (name) => headers.indexOf(name);
  const di = idx('day');
  return (payload.rows || []).map((row) => ({
    date: row[di],
    estimated_revenue: num(row[idx('estimatedRevenue')]),
    estimated_ad_revenue: num(row[idx('estimatedAdRevenue')]),
    gross_revenue: num(row[idx('grossRevenue')]),
    views: Math.round(num(row[idx('views')])),
    estimated_minutes_watched: Math.round(num(row[idx('estimatedMinutesWatched')])),
    cpm: num(row[idx('cpm')]),
  }));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Dates within `provisionalDays` of the LA cutoff are marked provisional. */
export function isProvisional(date, cutoffDate, provisionalDays = PROVISIONAL_DAYS) {
  return daysBetween(date, cutoffDate) < provisionalDays;
}

/** Idempotent upsert of daily revenue rows. Returns count written. */
export function upsertRevenue(db, channelId, rows, cutoffDate) {
  const stmt = db.prepare(`
    INSERT INTO revenue_daily
      (channel_id, date, currency, estimated_revenue, estimated_ad_revenue, gross_revenue,
       views, estimated_minutes_watched, cpm, provisional, updated_at)
    VALUES
      (@channel_id, @date, 'USD', @estimated_revenue, @estimated_ad_revenue, @gross_revenue,
       @views, @estimated_minutes_watched, @cpm, @provisional, datetime('now'))
    ON CONFLICT(channel_id, date) DO UPDATE SET
      estimated_revenue = excluded.estimated_revenue,
      estimated_ad_revenue = excluded.estimated_ad_revenue,
      gross_revenue = excluded.gross_revenue,
      views = excluded.views,
      estimated_minutes_watched = excluded.estimated_minutes_watched,
      cpm = excluded.cpm,
      provisional = excluded.provisional,
      updated_at = datetime('now')
  `);
  const tx = db.transaction((list) => {
    for (const r of list) {
      stmt.run({
        channel_id: channelId,
        date: r.date,
        estimated_revenue: r.estimated_revenue,
        estimated_ad_revenue: r.estimated_ad_revenue,
        gross_revenue: r.gross_revenue,
        views: r.views,
        estimated_minutes_watched: r.estimated_minutes_watched,
        cpm: r.cpm,
        provisional: isProvisional(r.date, cutoffDate) ? 1 : 0,
      });
    }
  });
  tx(rows);
  return rows.length;
}

// ── network ────────────────────────────────────────────────────────────────

/** Confirm a token can see a channel (S1.2). Returns [{id, title}]. */
export async function listMyChannels(accessToken, transport = defaultTransport) {
  const url = `${CHANNELS_URL}?part=id,snippet&mine=true`;
  const res = await transport(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw Object.assign(new Error(classifyYtError(res.status).message), classifyYtError(res.status));
  const body = await res.json();
  return (body.items || []).map((i) => ({ id: i.id, title: i.snippet?.title }));
}

/** One Analytics query for a channel/date range. Throws classified errors. */
export async function queryRevenue({ accessToken, channelId, startDate, endDate, transport = defaultTransport }) {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: METRICS.join(','),
    dimensions: 'day',
    sort: 'day',
  });
  const res = await transport(`${ANALYTICS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const c = classifyYtError(res.status);
    throw Object.assign(new Error(c.message), c);
  }
  return mapRevenueRows(await res.json());
}

/** Sanity check monetization for a channel (S1.3). Sets `monetized` flag. */
export async function checkMonetization(db, { channel, getToken, transport = defaultTransport }) {
  const cutoff = addDays(todayLA(), -REVENUE_LAG_DAYS);
  const day = addDays(cutoff, -1);
  try {
    const token = await getToken(channel);
    await queryRevenue({ accessToken: token, channelId: channel.youtube_channel_id, startDate: day, endDate: day, transport });
    db.prepare("UPDATE channels SET monetized = 1, monetized_checked_at = datetime('now') WHERE id = ?").run(channel.id);
    return { channel: channel.id, monetized: true };
  } catch (e) {
    if (e.kind === 'forbidden') {
      db.prepare("UPDATE channels SET monetized = 0, monetized_checked_at = datetime('now') WHERE id = ?").run(channel.id);
      return { channel: channel.id, monetized: false, reason: e.message };
    }
    throw e;
  }
}

/**
 * Sync one channel's revenue.
 * mode 'backfill' → from launch_date (or saved cursor) to cutoff, chunked, resumable.
 * mode 'incremental' → sliding 35-day window ending at cutoff (picks up revisions — R3).
 * Returns { channel, rows, from, to }.
 */
export async function syncChannelRevenue(db, { channel, getToken, transport = defaultTransport, mode = 'incremental' } = {}) {
  if (!channel.youtube_channel_id) {
    return { channel: channel.id, skipped: 'sem youtube_channel_id no config', rows: 0 };
  }
  const cutoff = addDays(todayLA(), -REVENUE_LAG_DAYS); // D-2
  const cursorKey = `yt_backfill_cursor:${channel.id}`;

  let start;
  if (mode === 'backfill') {
    const saved = db.prepare('SELECT value FROM meta WHERE key = ?').get(cursorKey)?.value;
    start = saved || channel.launch_date;
  } else {
    start = addDays(cutoff, -(SLIDING_WINDOW_DAYS - 1));
  }
  start = minDate(start, cutoff);
  if (daysBetween(start, cutoff) < 0) {
    return { channel: channel.id, rows: 0, note: 'nada a sincronizar (start > cutoff)' };
  }

  const runId = startRun(db, 'youtube', channel.id);
  let total = 0;
  try {
    const token = await getToken(channel);
    const chunks = chunkDateRange(start, cutoff, BACKFILL_CHUNK_DAYS);
    for (const { from, to } of chunks) {
      const rows = await withRetry(() => queryRevenue({ accessToken: token, channelId: channel.youtube_channel_id, startDate: from, endDate: to, transport }));
      total += upsertRevenue(db, channel.id, rows, cutoff);
      if (mode === 'backfill') {
        // Advance cursor so an interrupted backfill resumes here (S1.4 AC).
        db.prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        ).run(cursorKey, addDays(to, 1));
        updateCursor(db, runId, addDays(to, 1));
      }
    }
    if (mode === 'backfill') {
      db.prepare('DELETE FROM meta WHERE key = ?').run(cursorKey); // completed
    }
    finishRun(db, runId, { status: 'ok', rowsUpserted: total, message: `${mode} ${start}→${cutoff}` });
    return { channel: channel.id, rows: total, from: start, to: cutoff, mode };
  } catch (e) {
    finishRun(db, runId, { status: 'error', rowsUpserted: total, message: e.message, detail: e.kind || null });
    log.error(`YouTube sync falhou (${channel.id}): ${e.message}`);
    throw e;
  }
}

async function withRetry(fn, { tries = 4, baseMs = 400 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (!e.retryable || attempt >= tries) throw e;
      const wait = baseMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
