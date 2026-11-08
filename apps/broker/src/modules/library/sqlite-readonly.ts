import Database from 'better-sqlite3';
import { libraryUnavailable } from './errors.js';

/**
 * SQLite errors a read-only reader of a WAL database can hit for a moment
 * while the owner opens, recovers or checkpoints it (ADR 0022). Worth a retry.
 */
const TRANSIENT = new Set(['SQLITE_BUSY', 'SQLITE_READONLY_RECOVERY', 'SQLITE_PROTOCOL']);
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 20;

const pause = new Int32Array(new SharedArrayBuffer(4));
/** better-sqlite3 is synchronous, so the pause between retries is too. */
function sleep(ms: number): void {
  Atomics.wait(pause, 0, 0, ms);
}

function isTransient(err: unknown): boolean {
  return TRANSIENT.has((err as { code?: unknown }).code as string);
}

/**
 * A lazily opened, read-only handle on a database another program owns
 * (Calibre's metadata.db, CWA's app.db). The broker never writes to these.
 *
 * Both are in WAL mode and the broker mounts their folders read-only, so
 * SQLite reads the `-wal` and `-shm` files CWA keeps next to them but cannot
 * create them. That works while CWA runs; a short recovery by CWA is retried,
 * and a database CWA has closed cleanly (no `-wal` / `-shm`) reads as
 * LIBRARY_UNAVAILABLE until CWA is back (ADR 0022).
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
    for (let attempt = 1; ; attempt++) {
      try {
        return fn(db);
      } catch (err) {
        if (attempt < ATTEMPTS && isTransient(err)) {
          sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw libraryUnavailable(`Cannot read ${this.label}`, { cause: (err as Error).message });
      }
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
