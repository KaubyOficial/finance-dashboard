#!/usr/bin/env node
// CLI: print a table channel → conta → OK/FALTA AUTH (S1.2).
import { getDb } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { syncChannelsFromConfig } from '../src/config/channels.js';
import { resolveAccountForChannel } from '../src/sync/syncAll.js';
import { getAccessToken } from '../src/auth/google.js';
import { listMyChannels } from '../src/sync/youtube.js';
import { googleConfigured } from '../src/env.js';

const db = getDb();
runMigrations(db);
syncChannelsFromConfig(db);

const channels = db.prepare('SELECT * FROM channels ORDER BY name').all();
const rows = [];

for (const ch of channels) {
  const account = resolveAccountForChannel(db, ch);
  let state = 'FALTA AUTH';
  let detail = '';
  if (!ch.youtube_channel_id) {
    state = 'SEM UC (config)';
  } else if (!googleConfigured()) {
    state = 'GOOGLE não configurado (.env)';
  } else if (account) {
    try {
      const token = await getAccessToken(db, account);
      const mine = await listMyChannels(token);
      const match = mine.find((m) => m.id === ch.youtube_channel_id);
      state = match ? 'OK' : 'TOKEN OK, mas canal não visível';
      detail = match ? match.title : `visíveis: ${mine.map((m) => m.id).join(', ') || '—'}`;
    } catch (e) {
      state = 'ERRO';
      detail = e.message;
    }
  }
  rows.push({ canal: ch.id, conta: account || ch.google_account || '—', status: state, detalhe: detail });
}

console.table(rows);
const missing = rows.filter((r) => r.status !== 'OK');
if (missing.length) {
  console.log(`\n${missing.length} canal(is) precisam de ação (autorizar conta ou preencher UC no config).`);
  process.exit(missing.length === rows.length ? 1 : 0);
}
console.log('\n✅ Todos os canais cobertos.');
