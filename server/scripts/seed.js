#!/usr/bin/env node
// CLI: load deterministic demo data into the DB.
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { seedDemo } from '../src/dev/seed.js';
import { log } from '../src/logger.js';

const db = getDb();
runMigrations(db);
syncChannelsFromConfig(db);
seedDemo(db);
log.info('Seed determinístico aplicado (2 canais, Abr–Jun 2026, receita YT+Hotmart, reembolso, custo shared).');
