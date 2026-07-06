// Server entrypoint. Binds to 127.0.0.1 only (localhost — S7.4).
import { getDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { syncChannelsFromConfig } from './config/channels.js';
import { buildApp } from './server/app.js';
import { env } from './env.js';
import { log } from './logger.js';

const db = getDb();
runMigrations(db);
try {
  syncChannelsFromConfig(db);
} catch (e) {
  log.warn(`Config de canais não sincronizada: ${e.message}`);
}

const app = buildApp(db);
app
  .listen({ host: '127.0.0.1', port: env.port })
  .then(() => log.info(`Finance Dashboard API em http://127.0.0.1:${env.port}`))
  .catch((e) => {
    log.error(`Falha ao subir o servidor: ${e.message}`);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
}
