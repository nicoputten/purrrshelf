import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';

const config = loadConfig();
const database = openDatabase(config.DATABASE_PATH);
const app = await buildApp({ config, database });
// Resumes requests that waited for indexer budget; the only timed indexer work.
app.downloads.jobs.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => {
      database.close();
      process.exit(0);
    });
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
