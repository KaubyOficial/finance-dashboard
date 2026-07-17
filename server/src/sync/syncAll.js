// Orchestrates a full sync: FX + YouTube (all linked channels) + Hotmart.
// Each source is isolated — one failing doesn't abort the others (partial run).
import { syncFx } from './fx.js';
import { syncSales } from './hotmart.js';
import { syncChannelRevenue } from './youtube.js';
import { getAccessToken } from '../auth/google.js';
import { hotmartConfigured, googleConfigured } from '../env.js';
import { startRun, finishRun } from './syncLog.js';
import { bumpDataVersion } from '../engine/query.js';
import { notifyDesktop } from '../util/notify.js';
import { log } from '../logger.js';

/** Find a non-revoked OAuth account able to reach a channel (by id, then email/label). */
export function resolveAccountForChannel(db, channel) {
  // Convention: each channel is authorized with `npm run auth -- --account <channel.id>`.
  // This exact binding wins because email is NOT unique per channel: a delegated Brand
  // Account channel has no email of its own, so its token carries the *delegate's* email
  // — the same email as that delegate's own channel. Matching on email alone would then
  // resolve to whichever row SQLite returned first and silently sync the wrong channel.
  const byId = db
    .prepare('SELECT account FROM oauth_tokens WHERE revoked = 0 AND account = ? LIMIT 1')
    .get(channel.id);
  if (byId) return byId.account;

  const acct = channel.google_account;
  if (acct) {
    const row = db
      .prepare('SELECT account FROM oauth_tokens WHERE revoked = 0 AND (email = ? OR account = ?) LIMIT 1')
      .get(acct, acct);
    if (row) return row.account;
  }
  // Fallback: any authorized account (single-account setups).
  const any = db.prepare('SELECT account FROM oauth_tokens WHERE revoked = 0 LIMIT 1').get();
  return any ? any.account : null;
}

/**
 * @param opts.mode 'incremental' | 'backfill'
 * @param opts.transports optional { fx, hotmart } fake transports for tests
 * @param opts.only optional array subset of ['fx','youtube','hotmart']
 */
export async function runSyncAll(db, { mode = 'incremental', transports = {}, only } = {}) {
  const want = (s) => !only || only.includes(s);
  const runId = startRun(db, 'all', mode);
  const results = { fx: null, youtube: [], hotmart: null, errors: [] };

  // FX first — the engine needs rates to convert everything else.
  if (want('fx')) {
    try {
      results.fx = await syncFx(db, { mode, transport: transports.fx });
    } catch (e) {
      results.errors.push(`fx: ${e.message}`);
    }
  }

  if (want('youtube')) {
    if (!googleConfigured() && !transports.youtubeToken) {
      results.errors.push('youtube: Google não configurado (.env)');
    } else {
      const channels = db.prepare('SELECT * FROM channels WHERE active = 1').all();
      for (const ch of channels) {
        if (!ch.youtube_channel_id) continue;
        const account = resolveAccountForChannel(db, ch);
        if (!account && !transports.youtubeToken) {
          results.errors.push(`youtube:${ch.id}: sem token autorizado`);
          continue;
        }
        const getToken = transports.youtubeToken || (() => getAccessToken(db, account));
        try {
          const r = await syncChannelRevenue(db, { channel: ch, getToken, transport: transports.youtube, mode });
          results.youtube.push(r);
        } catch (e) {
          results.errors.push(`youtube:${ch.id}: ${e.message}`);
        }
      }
    }
  }

  if (want('hotmart')) {
    if (!hotmartConfigured() && !transports.hotmart) {
      results.errors.push('hotmart: não configurado (.env)');
    } else {
      try {
        // NB: do NOT pass since = MIN(order_date) from our own DB — that shrinks
        // a lifetime backfill to "sales we already know about" (bug found 2026-07-07).
        results.hotmart = await syncSales(db, { mode, transport: transports.hotmart });
      } catch (e) {
        results.errors.push(`hotmart: ${e.message}`);
      }
    }
  }

  bumpDataVersion();
  const status = results.errors.length ? (hasAnySuccess(results) ? 'partial' : 'error') : 'ok';
  const rows =
    (results.fx?.rows || 0) + (results.hotmart?.rows || 0) + results.youtube.reduce((a, r) => a + (r.rows || 0), 0);
  finishRun(db, runId, {
    status,
    rowsUpserted: rows,
    message: `${mode}: ${results.youtube.length} canais, ${results.errors.length} erro(s)`,
    detail: results.errors.join(' | ') || null,
  });

  if (status !== 'ok') {
    log.warn(`Sync ${status}: ${results.errors.join(' | ')}`);
    notifyDesktop({
      title: `⚠️ Finance Dashboard — sync ${status}`,
      text: results.errors.slice(0, 3).join('\n') || 'ver logs',
      level: status === 'error' ? 'danger' : 'warn',
    });
  } else {
    log.info(`Sync OK: ${rows} linhas atualizadas.`);
  }
  return { status, rows, ...results };
}

function hasAnySuccess(r) {
  return !!r.fx || !!r.hotmart || r.youtube.length > 0;
}
