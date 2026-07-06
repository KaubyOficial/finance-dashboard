import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateChannelsConfig, buildAttributionResolver } from '../src/config/channels.js';

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
