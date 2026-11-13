import { and, eq } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import {
  koboResends,
  type KoboResendPhase,
  type KoboResendRow,
  type User,
} from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { JobRunner } from '../jobs/runner.js';
import type { KoboSyncBook, LibraryAdapter } from './types.js';

export interface ResendLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export interface ResendUsers {
  list(): User[];
}

export const KOBO_RESEND_JOB = 'kobo_resend_check';
export const KOBO_RESEND_INTERVAL_MS = 10 * 60_000;
export const KOBO_RESEND_FIRST_DELAY_MS = 2 * 60_000;
/**
 * How long a synced book may stay undelivered before the broker steps in. A
 * Kobo downloads new books during the sync itself, so this is generous.
 */
export const KOBO_RESEND_GRACE_MS = 30 * 60_000;
/** Times a book is put back on the shelf before the broker gives up on it. */
export const KOBO_RESEND_MAX_ATTEMPTS = 3;

const NOWHERE: Omit<KoboSyncBook, 'bookId'> = {
  onKoboShelf: false,
  syncedToDevice: false,
  deliveredToDevice: false,
};

/** Shelf errors that mean "this reader's Kobo isn't set up", not "CWA is broken". */
const NOT_SET_UP = new Set(['KOBO_SHELF_MISSING', 'KOBO_SYNC_NOT_SET_UP']);

export interface ResendSummary {
  /** Books newly found marked synced but not on the Kobo. */
  found: number;
  /** Books taken off the shelf so the next sync clears CWA's mark. */
  takenOff: number;
  /** Books put back on the shelf so the next sync sends them again. */
  putBack: number;
  /** Books that reached the Kobo after a resend. */
  delivered: number;
  /** Books still missing after the last attempt. */
  gaveUp: number;
}

/**
 * Makes sure every book on a reader's Kobo shelf really reaches their Kobo
 * (BRK-16, ADR 0046).
 *
 * CWA marks a book synced while it builds the sync reply. If that reply never
 * reaches the Kobo, CWA never sends the book again. The broker spots such a
 * book (synced, but the Kobo never downloaded it or reported on it) and
 * resends it the only way a non-admin can: take it off the reader's Kobo
 * shelf, wait for a sync to clear CWA's mark, then put it back, so the next
 * sync sends it as a new book. Only the Kobo shelf API is used (ADR 0021);
 * nothing here touches an indexer.
 */
export class KoboResender {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly library: LibraryAdapter,
    private readonly users: ResendUsers,
    private readonly log: ResendLogger,
  ) {}

  /** Checks every linked reader once. One reader's failure never stops the others. */
  async check(): Promise<ResendSummary> {
    const summary: ResendSummary = { found: 0, takenOff: 0, putBack: 0, delivered: 0, gaveUp: 0 };
    for (const user of this.users.list()) {
      if (user.cwaUserId === null) continue;
      try {
        const books = await this.library.listKoboSync({ cwaUserId: user.cwaUserId });
        await this.checkReader(user, user.cwaUserId, books, summary);
      } catch (err) {
        if (err instanceof AppError && NOT_SET_UP.has(err.code)) continue;
        this.log.error({ userId: user.id, err }, 'could not check Kobo deliveries');
      }
    }
    return summary;
  }

  /** The resend state of one book for one reader, if the broker is working on it. */
  phaseOf(userId: string, calibreBookId: number): KoboResendPhase | null {
    return this.row(userId, calibreBookId)?.phase ?? null;
  }

  /** Every book the broker is resending (or gave up on), oldest first. */
  list(userId?: string): KoboResendRow[] {
    const rows = userId
      ? this.db.select().from(koboResends).where(eq(koboResends.userId, userId)).all()
      : this.db.select().from(koboResends).all();
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** The reader took the book off their Kobo themselves: stop resending it. */
  cancel(userId: string, calibreBookId: number): void {
    this.db.delete(koboResends).where(this.key(userId, calibreBookId)).run();
  }

  private async checkReader(
    user: User,
    cwaUserId: number,
    books: KoboSyncBook[],
    summary: ResendSummary,
  ): Promise<void> {
    const owner = { cwaUserId };
    const now = this.clock();
    const byId = new Map(books.map((b) => [b.bookId, b]));
    const rows = new Map(this.list(user.id).map((r) => [r.calibreBookId, r]));

    for (const book of books) {
      if (book.onKoboShelf && book.syncedToDevice && !book.deliveredToDevice) {
        if (rows.has(book.bookId)) continue;
        const row: KoboResendRow = {
          userId: user.id,
          calibreBookId: book.bookId,
          phase: 'waiting',
          attempts: 0,
          since: now,
          createdAt: now,
        };
        this.db.insert(koboResends).values(row).onConflictDoNothing().run();
        rows.set(book.bookId, row);
        summary.found++;
      }
    }

    for (const row of rows.values()) {
      const book = byId.get(row.calibreBookId) ?? { bookId: row.calibreBookId, ...NOWHERE };
      const ids = { userId: user.id, calibreBookId: row.calibreBookId, attempts: row.attempts };
      if (book.deliveredToDevice) {
        this.cancel(user.id, row.calibreBookId);
        if (row.attempts > 0) {
          summary.delivered++;
          this.log.info(ids, 'a resent book reached the Kobo');
        }
        continue;
      }
      switch (row.phase) {
        case 'waiting':
          if (!book.onKoboShelf) {
            this.cancel(user.id, row.calibreBookId);
          } else if (!book.syncedToDevice) {
            // CWA's mark is gone, so the next sync sends it anyway.
            this.move(row, 'back_on', now);
          } else if (now.getTime() - row.since.getTime() >= KOBO_RESEND_GRACE_MS) {
            if (row.attempts >= KOBO_RESEND_MAX_ATTEMPTS) {
              this.move(row, 'given_up', now);
              summary.gaveUp++;
              this.log.warn(ids, 'a book still did not reach the Kobo; giving up on it');
            } else {
              await this.library.removeFromKoboShelf(owner, row.calibreBookId);
              this.move(row, 'off_shelf', now);
              summary.takenOff++;
              this.log.info(ids, 'a synced book never reached the Kobo; resending it');
            }
          }
          break;
        case 'off_shelf':
          if (book.onKoboShelf) {
            // Someone put it back already; carry on from there.
            this.move(row, book.syncedToDevice ? 'waiting' : 'back_on', now);
          } else if (!book.syncedToDevice) {
            await this.library.addToKoboShelf(owner, row.calibreBookId);
            this.move(row, 'back_on', now, row.attempts + 1);
            summary.putBack++;
          }
          break;
        case 'back_on':
          if (!book.onKoboShelf) this.cancel(user.id, row.calibreBookId);
          // Synced again: give the Kobo its grace period to fetch it.
          else if (book.syncedToDevice) this.move(row, 'waiting', now);
          break;
        case 'given_up':
          if (!book.onKoboShelf) this.cancel(user.id, row.calibreBookId);
          break;
      }
    }
  }

  private move(row: KoboResendRow, phase: KoboResendPhase, now: Date, attempts = row.attempts) {
    this.db
      .update(koboResends)
      .set({ phase, since: now, attempts })
      .where(this.key(row.userId, row.calibreBookId))
      .run();
  }

  private row(userId: string, calibreBookId: number): KoboResendRow | undefined {
    return this.db.select().from(koboResends).where(this.key(userId, calibreBookId)).get();
  }

  private key(userId: string, calibreBookId: number) {
    return and(eq(koboResends.userId, userId), eq(koboResends.calibreBookId, calibreBookId));
  }
}

/** How often the resend runner looks for due jobs. */
const POLL_MS = 60_000;

/**
 * The resend check as a persisted job (the job runner is the only place that
 * keeps time): each run checks, then schedules the next one, even when the
 * check failed. A restart keeps the pending run.
 */
export class KoboResendJobs {
  readonly runner: JobRunner;

  constructor(
    db: Db,
    private readonly clock: Clock,
    resender: KoboResender,
    log: ResendLogger,
  ) {
    this.runner = new JobRunner(
      db,
      clock,
      {
        [KOBO_RESEND_JOB]: async () => {
          try {
            await resender.check();
          } finally {
            this.scheduleIn(KOBO_RESEND_INTERVAL_MS);
          }
        },
      },
      log,
    );
  }

  start(): void {
    if (this.runner.pending(KOBO_RESEND_JOB).length === 0) {
      this.scheduleIn(KOBO_RESEND_FIRST_DELAY_MS);
    }
    this.runner.start(POLL_MS);
  }

  stop(): Promise<void> {
    return this.runner.stop();
  }

  private scheduleIn(ms: number): void {
    this.runner.schedule(KOBO_RESEND_JOB, {}, new Date(this.clock().getTime() + ms));
  }
}
