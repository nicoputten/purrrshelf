import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { jobs } from '../src/db/schema.js';
import { JobRunner, type JobHandler } from '../src/modules/jobs/runner.js';
import { TestClock } from './helpers.js';

let database: DatabaseHandle;
let clock: TestClock;
const log = { error: vi.fn() };

beforeEach(() => {
  database = openDatabase(':memory:');
  clock = new TestClock();
  log.error.mockReset();
});

function runner(handlers: Record<string, JobHandler>) {
  return new JobRunner(database.db, clock.fn, handlers, log);
}

describe('JobRunner', () => {
  it('runs due jobs oldest first and deletes them', async () => {
    const seen: unknown[] = [];
    const r = runner({ a: async (p) => void seen.push(p) });
    r.schedule('a', { n: 2 }, new Date(clock.now.getTime() + 1000));
    r.schedule('a', { n: 1 }, clock.now);
    r.schedule('a', { n: 3 }, new Date(clock.now.getTime() + 60_000));
    clock.advance(1000);
    expect(await r.runDue()).toBe(2);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(r.pending('a')).toHaveLength(1);
    expect(r.types).toEqual(['a']);
  });

  it('refuses to schedule a type it has no handler for', () => {
    expect(() => runner({}).schedule('nope', {}, clock.now)).toThrow('No handler');
  });

  it('keeps a failed job with its error and never retries it', async () => {
    let calls = 0;
    const r = runner({
      a: async () => {
        calls++;
        throw new Error('boom');
      },
      b: async () => {
        throw 'plain';
      },
    });
    r.schedule('a', {}, clock.now);
    r.schedule('b', {}, clock.now);
    expect(await r.runDue()).toBe(2);
    clock.advance(60 * 60_000);
    expect(await r.runDue()).toBe(0);
    expect(calls).toBe(1);
    const rows = database.db.select().from(jobs).all();
    expect(rows.map((j) => [j.lastError, j.attempts, j.failedAt])).toEqual([
      ['boom', 1, expect.any(Date)],
      ['plain', 1, expect.any(Date)],
    ]);
    expect(r.pending('a')).toEqual([]);
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it('leaves jobs of types it does not handle alone', async () => {
    runner({ a: async () => undefined }).schedule('a', {}, clock.now);
    expect(await runner({ other: async () => undefined }).runDue()).toBe(0);
  });

  it('skips a job locked by a running worker', async () => {
    let release!: () => void;
    const r = runner({ a: () => new Promise<void>((res) => (release = res)) });
    r.schedule('a', {}, clock.now);
    const first = r.runDue();
    expect(await runner({ a: async () => undefined }).runDue()).toBe(0);
    release();
    expect(await first).toBe(1);
  });

  it('runs on an interval once started, one pass at a time, and stops', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const r = runner({ a: async () => void n++ });
      r.start(1000);
      r.start(1000); // a second start is ignored
      r.schedule('a', {}, clock.now);
      await vi.advanceTimersByTimeAsync(1000);
      expect(n).toBe(1);
      r.schedule('a', {}, clock.now);
      await vi.advanceTimersByTimeAsync(1000);
      expect(n).toBe(2);
      await r.stop();
      r.schedule('a', {}, clock.now);
      await vi.advanceTimersByTimeAsync(5000);
      expect(n).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
