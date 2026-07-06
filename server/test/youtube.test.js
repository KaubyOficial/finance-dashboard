import { describe, it, expect } from 'vitest';
import { makeDb, fakeTransport } from './helpers.js';
import {
  mapRevenueRows,
  classifyYtError,
  isProvisional,
  upsertRevenue,
  syncChannelRevenue,
  checkMonetization,
} from '../src/sync/youtube.js';
import { chunkDateRange } from '../src/util/dates.js';

const HEADERS = [
  { name: 'day' },
  { name: 'estimatedRevenue' },
  { name: 'estimatedAdRevenue' },
  { name: 'grossRevenue' },
  { name: 'views' },
  { name: 'estimatedMinutesWatched' },
  { name: 'cpm' },
];

describe('youtube pure helpers', () => {
  it('maps analytics rows to daily objects', () => {
    const rows = mapRevenueRows({ columnHeaders: HEADERS, rows: [['2026-04-01', 10.5, 9, 12, 5000, 12000, 2.1]] });
    expect(rows[0]).toMatchObject({ date: '2026-04-01', estimated_revenue: 10.5, views: 5000 });
  });

  it('classifies HTTP errors', () => {
    expect(classifyYtError(401).kind).toBe('auth');
    expect(classifyYtError(403).kind).toBe('forbidden');
    expect(classifyYtError(429).retryable).toBe(true);
    expect(classifyYtError(503).retryable).toBe(true);
  });

  it('marks the last 3 days provisional', () => {
    expect(isProvisional('2026-04-10', '2026-04-10')).toBe(true);
    expect(isProvisional('2026-04-08', '2026-04-10')).toBe(true);
    expect(isProvisional('2026-04-07', '2026-04-10')).toBe(false);
  });

  it('chunks a lifetime range', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-06-30', 90);
    expect(chunks[0].from).toBe('2026-01-01');
    expect(chunks.at(-1).to).toBe('2026-06-30');
  });
});

describe('upsertRevenue idempotency', () => {
  it('running the same rows twice yields identical table state', () => {
    const db = makeDb();
    db.prepare("UPDATE channels SET youtube_channel_id='UC1' WHERE id='redef_de'").run();
    const rows = [{ date: '2026-04-01', estimated_revenue: 10, estimated_ad_revenue: 9, gross_revenue: 11, views: 5000, estimated_minutes_watched: 12000, cpm: 2 }];
    upsertRevenue(db, 'redef_de', rows, '2026-04-05');
    upsertRevenue(db, 'redef_de', rows, '2026-04-05');
    const count = db.prepare("SELECT COUNT(*) c FROM revenue_daily WHERE channel_id='redef_de'").get().c;
    expect(count).toBe(1);
  });
});

describe('syncChannelRevenue with a fake transport', () => {
  const channel = { id: 'redef_de', youtube_channel_id: 'UC1', launch_date: '2026-04-01' };
  const transport = fakeTransport((url) => {
    const u = new URL(url);
    const start = u.searchParams.get('startDate');
    const end = u.searchParams.get('endDate');
    const rows = [];
    for (let d = start; d <= end; d = addOneDay(d)) rows.push([d, 5, 4.5, 5.5, 1000, 3000, 1.5]);
    return { status: 200, body: { columnHeaders: HEADERS, rows } };
  });
  const getToken = async () => 'fake-token';

  it('incremental sync writes rows and logs ok', async () => {
    const db = makeDb();
    const r = await syncChannelRevenue(db, { channel, getToken, transport, mode: 'incremental' });
    expect(r.rows).toBeGreaterThan(0);
    const log = db.prepare("SELECT status FROM sync_log WHERE source='youtube' ORDER BY id DESC LIMIT 1").get();
    expect(log.status).toBe('ok');
  });

  it('backfill is resumable — cursor cleared on completion', async () => {
    const db = makeDb();
    await syncChannelRevenue(db, { channel, getToken, transport, mode: 'backfill' });
    const cursor = db.prepare('SELECT value FROM meta WHERE key = ?').get('yt_backfill_cursor:redef_de');
    expect(cursor).toBeUndefined(); // completed → cleared
  });

  it('403 marks the channel non-monetized (checkMonetization)', async () => {
    const db = makeDb();
    db.prepare("UPDATE channels SET youtube_channel_id='UC1' WHERE id='redef_de'").run();
    const t403 = fakeTransport(() => ({ status: 403, body: { error: {} } }));
    const r = await checkMonetization(db, { channel, getToken, transport: t403 });
    expect(r.monetized).toBe(false);
    const row = db.prepare("SELECT monetized FROM channels WHERE id='redef_de'").get();
    expect(row.monetized).toBe(0);
  });
});

function addOneDay(d) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
