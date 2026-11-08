import Database from 'better-sqlite3';
import { libraryUnavailable } from './errors.js';

/**
 * A lazily opened, read-only handle on a database another program owns
 * (Calibre's metadata.db, CWA's app.db). The broker never writes to these.
 */
export class ReadOnlySqlite {
  private handle: Database.Database | null = null;

  constructor(
    private readonly path: string,
    private readonly label: string,
  ) {}

  get db(): Database.Database {
    if (!this.handle) {
      try {
        const db = new Database(this.path, { readonly: true, fileMustExist: true });
        db.pragma('busy_timeout = 5000');
        this.handle = db;
      } catch (err) {
        throw libraryUnavailable(`Cannot open ${this.label}`, { cause: (err as Error).message });
      }
    }
    return this.handle;
  }

  /** Runs a query, turning SQLite failures (locked, missing table, …) into LIBRARY_UNAVAILABLE. */
  run<T>(fn: (db: Database.Database) => T): T {
    const db = this.db;
    try {
      return fn(db);
    } catch (err) {
      throw libraryUnavailable(`Cannot read ${this.label}`, { cause: (err as Error).message });
    }
  }

  close(): void {
    this.handle?.close();
    this.handle = null;
  }
}

/**
 * Calibre and SQLAlchemy store times as `YYYY-MM-DD HH:MM:SS[.ffffff][+00:00]`
 * in UTC. Returns null for empty or unparsable values.
 */
export function parseSqliteTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  let iso = value.trim().replace(' ', 'T');
  // JavaScript keeps milliseconds only.
  iso = iso.replace(/(\.\d{3})\d+/, '$1');
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(iso)) iso += 'Z';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
