import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateChannelsConfig, buildAttributionResolver, syncChannelsFromConfig } from '../src/config/channels.js';
import { makeDb } from './helpers.js';

function writeCfg(obj) {
  const p = path.join(os.tmpdir(), `chan-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

describe('channels config validator', () => {
  it('accepts a valid config, flags pending placeholders as warnings', () => {
    const p = writeCfg({
      version: 1,
      channels: [{ id: 'a', name: 'A', youtube_channel_id: '', google_account: '', src_prefixes: ['yt_a'], launch_date: '2024-01-01' }],
    });
    const r = validateChannelsConfig(p);
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBe(2); // UC + google_account pending
  });

  it('rejects duplicate ids', () => {
    const p = writeCfg({
      version: 1,
      channels: [
        { id: 'a', name: 'A', src_prefixes: ['yt_a'], launch_date: '2024-01-01' },
        { id: 'a', name: 'A2', src_prefixes: ['yt_a2'], launch_date: '2024-01-01' },
      ],
    });
    const r = validateChannelsConfig(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/duplicado/);
  });

  it('rejects hotmart_product_id collisions across channels', () => {
    const p = writeCfg({
      version: 1,
      channels: [
        { id: 'a', name: 'A', src_prefixes: ['yt_a'], hotmart_product_ids: ['123'], launch_date: '2024-01-01' },
        { id: 'b', name: 'B', src_prefixes: ['yt_b'], hotmart_product_ids: [123], launch_date: '2024-01-01' },
      ],
    });
    const r = validateChannelsConfig(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/hotmart_product_id/);
  });

  it('rejects src-prefix collisions across channels', () => {
    const p = writeCfg({
      version: 1,
      channels: [
        { id: 'a', name: 'A', src_prefixes: ['yt_x'], launch_date: '2024-01-01' },
        { id: 'b', name: 'B', src_prefixes: ['yt_x'], launch_date: '2024-01-01' },
      ],
    });
    const r = validateChannelsConfig(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/colisão/);
  });

  it('prunes channels removed from the config: deletes data-free, deactivates with data', () => {
    const db = makeDb({ withConfig: false });
    const base = { youtube_channel_id: '', google_account: '', launch_date: '2024-01-01', reference_currency: 'USD' };
    const cfg1 = writeCfg({
      version: 1,
      channels: [
        { id: 'a', name: 'A', src_prefixes: ['yt_a'], ...base },
        { id: 'b', name: 'B', src_prefixes: ['yt_b'], ...base },
        { id: 'c', name: 'C', src_prefixes: ['yt_c'], ...base },
      ],
    });
    let r = syncChannelsFromConfig(db, cfg1);
    expect(r.added).toBe(3);

    // 'a' accumulates data; 'b' stays empty.
    db.prepare("INSERT INTO revenue_daily (channel_id, date) VALUES ('a', '2026-01-01')").run();

    const cfg2 = writeCfg({ version: 1, channels: [{ id: 'c', name: 'C', src_prefixes: ['yt_c'], ...base }] });
    r = syncChannelsFromConfig(db, cfg2);
    expect(r.removed).toBe(1); // b — no data
    expect(r.deactivated).toBe(1); // a — has revenue, kept for history

    const rows = Object.fromEntries(db.prepare('SELECT id, active FROM channels').all().map((x) => [x.id, x.active]));
    expect(rows).toEqual({ a: 0, c: 1 });
  });

  it('resolver prefers the longest matching prefix', () => {
    const resolve = buildAttributionResolver([
      { id: 'de', src_prefixes: ['yt_redef_de'] },
      { id: 'de_v', src_prefixes: ['yt_redef_de_video9'] },
    ]);
    expect(resolve('yt_redef_de_video9_extra')).toBe('de_v');
    expect(resolve('yt_redef_de_other')).toBe('de');
    expect(resolve('nope')).toBe(null);
    expect(resolve('YT_REDEF_DE')).toBe('de'); // case-insensitive
  });
});
