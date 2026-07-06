#!/usr/bin/env node
// CLI: recompute src→channel attribution after editing config (S2.3).
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { reattributeAll, unattributedStats } from '../src/sync/attribution.js';
import { log } from '../src/logger.js';

const db = getDb();
runMigrations(db);
syncChannelsFromConfig(db);

const r = reattributeAll(db);
const stats = unattributedStats(db);
log.info(`Reatribuição: ${r.changed}/${r.scanned} vendas alteradas.`);
log.info(`Não atribuídas: ${stats.unattributed}/${stats.total} (${(stats.pct * 100).toFixed(1)}%).`);
