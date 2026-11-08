import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { AppError } from '../../errors.js';
import { JobRunner } from '../jobs/runner.js';
import type { LibraryItems } from './items.js';
import type { LibraryAdapter } from './types.js';

export interface CleanupLogger {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export const CLEANUP_JOB = 'library_cleanup';
export const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;
/** The first sweep waits a little after start-up, so CWA can come up too. */
export const CLEANUP_FIRST_DELAY_MS = 5 * 60_000;

/**
 * The daily job that deletes books nobody owns once their grace period is
 * over (BRK-08, ADR 0009), through the library adapter. A book that fails to
 * delete is kept and tried again the next day; this never touches an indexer.
 */
export class LibraryCleanup {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter,
    private readonly log: CleanupLogger,
  ) {}

  /** Deletes every expired item. Returns how many were deleted. */
  async sweep(): Promise<number> {
    let deleted = 0;
    for (const item of this.items.expired()) {
      try {
        await this.library.deleteBook(item.calibreBookId);
      } catch (err) {
        // Already gone from Calibre (deleted by hand): just forget it.
        if (!(err instanceof AppError && err.code === 'NOT_FOUND')) {
          this.log.error(
            { itemId: item.id, calibreBookId: item.calibreBookId, err },
            'could not delete an unowned book; trying again tomorrow',
          );
          continue;
        }
      }
      this.items.remove(item.id);
      this.log.info({ itemId: item.id, title: item.title }, 'deleted a book nobody owns');
      deleted++;
    }
    return deleted;
  }
}

/** How often the library's job runner looks for due jobs. */
const POLL_MS = 60_000;

/**
 * The daily cleanup as a persisted job (the job runner is the only place that
 * keeps time, ADR 0004): each run sweeps, then schedules the next one a day
 * later, even when the sweep failed. A restart keeps the pending run.
 */
export class CleanupJobs {
  readonly runner: JobRunner;

  constructor(
    db: Db,
    private readonly clock: Clock,
    cleanup: LibraryCleanup,
    log: CleanupLogger,
  ) {
    this.runner = new JobRunner(
      db,
      clock,
      {
        [CLEANUP_JOB]: async () => {
          try {
            await cleanup.sweep();
          } finally {
            this.scheduleIn(CLEANUP_INTERVAL_MS);
          }
        },
      },
      log,
    );
  }

  start(): void {
    if (this.runner.pending(CLEANUP_JOB).length === 0) this.scheduleIn(CLEANUP_FIRST_DELAY_MS);
    this.runner.start(POLL_MS);
  }

  stop(): Promise<void> {
    return this.runner.stop();
  }

  private scheduleIn(ms: number): void {
    this.runner.schedule(CLEANUP_JOB, {}, new Date(this.clock().getTime() + ms));
  }
}
