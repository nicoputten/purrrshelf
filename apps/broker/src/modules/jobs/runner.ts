import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { jobs, type JobRow } from '../../db/schema.js';

export type JobHandler = (payload: unknown) => Promise<void>;

export interface JobLogger {
  error: (obj: object, msg: string) => void;
}

/** How long a running job stays locked before another worker may take it. */
const LOCK_MS = 5 * 60_000;

/**
 * Small persisted job runner: a jobs table plus an in-process worker.
 * A failed job is kept with its error and never retried automatically
 * (no background retries, ADR 0004).
 */
export class JobRunner {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<number> | undefined;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly handlers: Readonly<Record<string, JobHandler>>,
    private readonly log: JobLogger,
  ) {}

  /** The job types this runner executes. */
  get types(): string[] {
    return Object.keys(this.handlers);
  }

  schedule(type: string, payload: unknown, runAt: Date): JobRow {
    if (!this.handlers[type]) throw new Error(`No handler for job type "${type}"`);
    return this.db
      .insert(jobs)
      .values({ type, payloadJson: JSON.stringify(payload), runAt, createdAt: this.clock() })
      .returning()
      .get();
  }

  /** Pending (not failed) jobs of a type, earliest first. */
  pending(type: string): JobRow[] {
    return this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, type), isNull(jobs.failedAt)))
      .orderBy(asc(jobs.runAt))
      .all();
  }

  /** Runs every due job once, oldest first. Returns how many ran. */
  async runDue(): Promise<number> {
    let ran = 0;
    for (;;) {
      const claimed = this.claim();
      if (!claimed) return ran;
      const { job, handler } = claimed;
      ran++;
      try {
        await handler(JSON.parse(job.payloadJson));
        this.db.delete(jobs).where(eq(jobs.id, job.id)).run();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error({ err, jobId: job.id, type: job.type }, 'job failed');
        this.db
          .update(jobs)
          .set({ lastError: message, failedAt: this.clock(), lockedUntil: null })
          .where(eq(jobs.id, job.id))
          .run();
      }
    }
  }

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.running ??= this.runDue().finally(() => {
        this.running = undefined;
      });
    }, intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }

  private claim(): { job: JobRow; handler: JobHandler } | undefined {
    const now = this.clock();
    return this.db.transaction((tx) => {
      const job = tx
        .select()
        .from(jobs)
        .where(
          and(
            lte(jobs.runAt, now),
            isNull(jobs.failedAt),
            or(isNull(jobs.lockedUntil), lte(jobs.lockedUntil, now)),
          ),
        )
        .orderBy(asc(jobs.runAt), asc(jobs.id))
        .all()
        .flatMap((j) => {
          const handler = this.handlers[j.type];
          return handler ? [{ job: j, handler }] : [];
        })[0];
      if (!job) return undefined;
      tx.update(jobs)
        .set({ lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: job.job.attempts + 1 })
        .where(eq(jobs.id, job.job.id))
        .run();
      return job;
    });
  }
}
