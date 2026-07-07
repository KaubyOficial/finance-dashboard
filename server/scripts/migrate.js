#!/usr/bin/env node
// CLI: create/upgrade the database. Safe to run repeatedly.
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { log } from '../src/logger.js';

const db = getDb();
const applied = runMigrations(db);
if (applied.length) {
  log.info(`Migrações aplicadas: ${applied.join(', ')}`);
} else {
  log.info('Banco já está atualizado (nenhuma migração pendente).');
}

// Keep the channels table in sync with config on every migrate (best-effort).
try {
  const { added, updated, removed, deactivated } = syncChannelsFromConfig(db);
  const pruned = [removed && `${removed} removidos`, deactivated && `${deactivated} desativados`].filter(Boolean).join(', ');
  log.info(`Canais sincronizados do config: +${added} novos, ${updated} atualizados${pruned ? `, ${pruned}` : ''}.`);
} catch (e) {
  log.warn(`Config de canais não sincronizada: ${e.message}`);
}
