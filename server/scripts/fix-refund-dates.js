#!/usr/bin/env node
// One-time data repair: re-date refunds that were stamped with the sync date.
//
// Hotmart's sales/history & sales/commissions endpoints do NOT expose a refund
// timestamp (probed 2026-07-07), so mapSaleItem used to fall back to the sync
// date — dumping every lifetime refund into the current month. The fix books a
// reversal on the sale's own order_date instead. This backfills existing rows to
// match, so a full re-sync isn't required. Idempotent: re-running it is a no-op
// once every refund already sits on its order_date.
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { bumpDataVersion } from '../src/engine/query.js';
import { log } from '../src/logger.js';

const db = getDb();
runMigrations(db);

const WHERE = `refund_amount > 0 AND order_date IS NOT NULL AND (refund_date IS NULL OR refund_date <> order_date)`;
const before = db.prepare(`SELECT COUNT(*) n FROM sales WHERE ${WHERE}`).get();
const res = db.prepare(`UPDATE sales SET refund_date = order_date WHERE ${WHERE}`).run();

bumpDataVersion();
log.info(`Refund dates realinhadas ao order_date: ${res.changes} linha(s) (candidatas: ${before.n}).`);
