import { parseSqliteTime, ReadOnlySqlite } from './sqlite-readonly.js';
import type { DeviceState, ReadingState, ReadStatus } from './types.js';

export interface CwaShelf {
  id: number;
  uuid: string;
  name: string;
  userId: number;
  koboSync: boolean;
}

/** CWA's `book_read_link.read_status` values. */
const READ_STATUS: Record<number, ReadStatus> = { 0: 'unread', 1: 'finished', 2: 'reading' };

interface ReadRow {
  read_status: number;
  last_modified: string | null;
}

interface KoboRow {
  last_modified: string | null;
  progress_percent: number | null;
  spent_reading_minutes: number | null;
  remaining_time_minutes: number | null;
}

function toReadingState(read?: ReadRow, kobo?: KoboRow): ReadingState {
  const times = [parseSqliteTime(read?.last_modified), parseSqliteTime(kobo?.last_modified)]
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return {
    status: READ_STATUS[read?.read_status ?? 0] ?? 'unread',
    progressPercent: kobo?.progress_percent ?? null,
    spentReadingMinutes: kobo?.spent_reading_minutes ?? null,
    remainingMinutes: kobo?.remaining_time_minutes ?? null,
    lastModified: times.length ? new Date(Math.max(...times)) : null,
  };
}

/**
 * Read-only queries on CWA's settings database, `app.db`. The broker reads
 * users, shelves, Kobo sync tokens and reading state here and never writes:
 * changes go through CWA itself.
 */
export class CwaAppDb {
  private readonly sqlite: ReadOnlySqlite;

  constructor(path: string) {
    this.sqlite = new ReadOnlySqlite(path, 'CWA app.db');
  }

  ping(): void {
    this.sqlite.run((db) => db.prepare('select count(*) from user').get());
  }

  /** All shelves the user owns with this exact name (CWA allows duplicates). */
  shelvesByName(cwaUserId: number, name: string): CwaShelf[] {
    return this.sqlite.run((db) =>
      (
        db
          .prepare(
            `select id, uuid, name, user_id, kobo_sync from shelf
             where user_id = ? and name = ? order by id`,
          )
          .all(cwaUserId, name) as {
          id: number;
          uuid: string;
          name: string;
          user_id: number;
          kobo_sync: number | null;
        }[]
      ).map((r) => ({
        id: r.id,
        uuid: r.uuid,
        name: r.name,
        userId: r.user_id,
        koboSync: Boolean(r.kobo_sync),
      })),
    );
  }

  /** CWA's id for a user name, compared case-insensitively like CWA's login. */
  userIdByName(name: string): number | null {
    return this.sqlite.run((db) => {
      const row = db
        .prepare('select id from user where lower(name) = lower(?) order by id limit 1')
        .get(name) as { id: number } | undefined;
      return row?.id ?? null;
    });
  }

  userExists(cwaUserId: number): boolean {
    return this.sqlite.run(
      (db) => db.prepare('select 1 from user where id = ?').get(cwaUserId) !== undefined,
    );
  }

  /** The user's Kobo sync token (token_type 1), which the Kobo uses to act as that user. */
  koboToken(cwaUserId: number): string | null {
    return this.sqlite.run((db) => {
      const row = db
        .prepare(
          `select auth_token from remote_auth_token
           where user_id = ? and token_type = 1 order by id limit 1`,
        )
        .get(cwaUserId) as { auth_token: string } | undefined;
      return row?.auth_token ?? null;
    });
  }

  deviceState(cwaUserId: number, shelfId: number, bookId: number): DeviceState {
    return this.sqlite.run((db) => ({
      onKoboShelf:
        db
          .prepare('select 1 from book_shelf_link where shelf = ? and book_id = ? limit 1')
          .get(shelfId, bookId) !== undefined,
      syncedToDevice:
        db
          .prepare('select 1 from kobo_synced_books where user_id = ? and book_id = ? limit 1')
          .get(cwaUserId, bookId) !== undefined,
    }));
  }

  readingState(cwaUserId: number, bookId: number): ReadingState {
    return this.readingStatesWhere(cwaUserId, bookId).get(bookId) ?? toReadingState();
  }

  /** Every book this user has a read status or Kobo position for, in one go. */
  readingStates(cwaUserId: number): Map<number, ReadingState> {
    return this.readingStatesWhere(cwaUserId, null);
  }

  private readingStatesWhere(cwaUserId: number, bookId: number | null): Map<number, ReadingState> {
    const oneBook = bookId === null ? '' : 'and book_id = ?';
    const args = bookId === null ? [cwaUserId] : [cwaUserId, bookId];
    return this.sqlite.run((db) => {
      // The newest row per book wins, as CWA itself reads them.
      const reads = new Map<number, ReadRow>();
      for (const row of db
        .prepare(
          `select book_id, read_status, last_modified from book_read_link
           where user_id = ? ${oneBook} order by id`,
        )
        .all(...args) as (ReadRow & { book_id: number })[]) {
        reads.set(row.book_id, row);
      }
      const kobos = new Map<number, KoboRow>();
      for (const row of db
        .prepare(
          `select rs.book_id, rs.last_modified, bm.progress_percent, st.spent_reading_minutes, st.remaining_time_minutes
           from kobo_reading_state rs
           left join kobo_bookmark bm on bm.kobo_reading_state_id = rs.id
           left join kobo_statistics st on st.kobo_reading_state_id = rs.id
           where rs.user_id = ? ${oneBook.replace('book_id', 'rs.book_id')} order by rs.id`,
        )
        .all(...args) as (KoboRow & { book_id: number })[]) {
        kobos.set(row.book_id, row);
      }
      const states = new Map<number, ReadingState>();
      for (const id of new Set([...reads.keys(), ...kobos.keys()])) {
        states.set(id, toReadingState(reads.get(id), kobos.get(id)));
      }
      return states;
    });
  }

  close(): void {
    this.sqlite.close();
  }
}
