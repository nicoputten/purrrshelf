import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  db: Db;
  close: () => void;
  /** Cheap query for the health endpoint. */
  ping: () => void;
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Opens (or creates) the SQLite database and applies pending migrations. */
export function openDatabase(path: string): DatabaseHandle {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return {
    db,
    close: () => sqlite.close(),
    ping: () => {
      sqlite.prepare('select 1').get();
    },
  };
}
