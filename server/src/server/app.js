// Fastify app factory. buildApp(db) is used both by the server entrypoint and by
// integration tests (S4.3). All endpoints under /api. Localhost-only (S7.4).
import Fastify from 'fastify';
import { z } from 'zod';
import { getPnL, getDailyRevenue, salesForChannel, bumpDataVersion } from '../engine/query.js';
import { UNATTRIBUTED } from '../engine/pnl.js';
import { withDerived } from '../engine/derived.js';
import { createCost, updateCost, deleteCost, listCosts } from '../costs/service.js';
import { importCsv } from '../costs/csv.js';
import { reattributeAll, manualAttribute, unattributedStats } from '../sync/attribution.js';
import { recentRuns } from '../sync/syncLog.js';
import { dataFreshness, tokenStatus, syncHealthy } from '../status.js';
import { getConfigChannels } from '../config/channels.js';
import { triggerSync, getSyncState } from './syncRunner.js';
import { todayUTC, addDays, monthStart, monthKey } from '../util/dates.js';

const DEFAULTS = () => {
  const to = todayUTC();
  // First day of the month ~12 months back. monthStart expects a 'YYYY-MM' key,
  // so reduce the full date through monthKey first (else it builds 'YYYY-MM-DD-01').
  const from = monthStart(monthKey(addDays(to, -364)));
  return { from, to };
};

const pnlQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  currency: z.enum(['USD', 'BRL', 'EUR']).optional().default('USD'),
  groupBy: z.enum(['month', 'channel']).optional().default('month'),
  channels: z.string().optional(),
});

function parsePnlParams(q) {
  const p = pnlQuery.parse(q);
  const d = DEFAULTS();
  return {
    from: p.from || d.from,
    to: p.to || d.to,
    displayCurrency: p.currency,
    groupBy: p.groupBy,
    channels: p.channels ? p.channels.split(',').filter(Boolean) : null,
  };
}

export function buildApp(db, { logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 10 * 1024 * 1024 });
  app.decorate('db', db);

  // Reject non-localhost hosts (defence-in-depth; we also bind to 127.0.0.1).
  app.addHook('onRequest', async (req, reply) => {
    const host = (req.headers.host || '').split(':')[0];
    if (host && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
      reply.code(403).send({ error: 'somente localhost' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.status || err.statusCode || 500;
    reply.code(status).send({ error: err.message });
  });

  // ── health ────────────────────────────────────────────────────────────────
  app.get('/api/health', async () => ({
    ok: true,
    healthy: syncHealthy(db),
    freshness: dataFreshness(db),
  }));

  // ── config / channels ───────────────────────────────────────────────────────
  app.get('/api/config', async () => ({
    channels: getConfigChannels(),
    currencies: ['USD', 'BRL', 'EUR'],
  }));

  app.get('/api/channels', async () => {
    const rows = db
      .prepare(
        `SELECT c.*,
           (SELECT MAX(date) FROM revenue_daily r WHERE r.channel_id = c.id) AS revenue_until
         FROM channels c WHERE c.active = 1 ORDER BY c.name`
      )
      .all();
    return { channels: rows };
  });

  // ── P&L ─────────────────────────────────────────────────────────────────────
  app.get('/api/pnl', async (req) => getPnL(db, parsePnlParams(req.query)));

  // Day-by-day revenue (AdSense + Hotmart − refunds; no costs) — "Receita diária".
  app.get('/api/revenue/daily', async (req) => getDailyRevenue(db, parsePnlParams(req.query)));

  app.get('/api/channels/:id', async (req) => {
    const id = req.params.id;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    if (!channel && id !== UNATTRIBUTED) {
      const e = new Error('canal não encontrado');
      e.status = 404;
      throw e;
    }
    const params = parsePnlParams(req.query);
    const pnl = getPnL(db, { ...params, channels: [id], groupBy: 'month' });
    const costs = id === UNATTRIBUTED ? [] : listCosts(db, { channel_id: id });
    const sales = salesForChannel(db, id, { from: params.from, to: params.to });
    const costBreakdown = withDerived(
      Object.values(
        costs.reduce((acc, c) => {
          acc[c.category] ??= { category: c.category, count: 0 };
          acc[c.category].count += 1;
          return acc;
        }, {})
      )
    );
    return { channel: channel || { id, name: 'Não atribuído' }, pnl, sales, costs, costBreakdown };
  });

  // ── costs CRUD + CSV ─────────────────────────────────────────────────────────
  app.get('/api/costs', async (req) => ({ costs: listCosts(db, req.query || {}) }));

  app.post('/api/costs', async (req, reply) => {
    const cost = createCost(db, req.body);
    bumpDataVersion();
    reply.code(201);
    return { cost };
  });

  app.put('/api/costs/:id', async (req) => {
    const cost = updateCost(db, Number(req.params.id), req.body);
    bumpDataVersion();
    return { cost };
  });

  app.delete('/api/costs/:id', async (req, reply) => {
    const ok = deleteCost(db, Number(req.params.id));
    if (!ok) {
      reply.code(404);
      return { error: 'custo não encontrado' };
    }
    bumpDataVersion();
    return { deleted: true };
  });

  app.post('/api/costs/import', async (req) => {
    const { csv, commit = false } = req.body || {};
    if (typeof csv !== 'string') {
      const e = new Error('campo "csv" (string) obrigatório');
      e.status = 400;
      throw e;
    }
    const result = importCsv(db, csv, { dryRun: !commit });
    if (commit) bumpDataVersion();
    return result;
  });

  // ── attribution ──────────────────────────────────────────────────────────────
  app.get('/api/attribution', async () => {
    const unmatched = salesForChannel(db, UNATTRIBUTED, {});
    return { stats: unattributedStats(db), unmatched };
  });

  app.post('/api/attribution/manual', async (req) => {
    const { transaction_ids, channel_id } = req.body || {};
    if (!Array.isArray(transaction_ids) || !channel_id) {
      const e = new Error('transaction_ids[] e channel_id obrigatórios');
      e.status = 400;
      throw e;
    }
    const r = manualAttribute(db, transaction_ids, channel_id);
    bumpDataVersion();
    return r;
  });

  app.post('/api/attribution/reattribute', async () => {
    const r = reattributeAll(db);
    bumpDataVersion();
    return r;
  });

  // ── sync ─────────────────────────────────────────────────────────────────────
  app.get('/api/sync/status', async () => ({
    state: getSyncState(),
    freshness: dataFreshness(db),
    tokens: tokenStatus(db),
    recent: recentRuns(db, 30),
    healthy: syncHealthy(db),
  }));

  app.post('/api/sync', async (req) => {
    const body = req.body || {};
    const only = Array.isArray(body.only) ? body.only : undefined;
    const mode = body.mode === 'backfill' ? 'backfill' : 'incremental';
    return triggerSync(db, { mode, only });
  });

  return app;
}
