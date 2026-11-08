import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { budgetEvents } from '../src/db/schema.js';
import {
  BUDGET_WINDOW_MS,
  BudgetExhaustedError,
  IndexerBudget,
  IndexerLimitReachedError,
  UnknownIndexerError,
} from '../src/modules/budget/budget.js';
import { IndexerRepository } from '../src/modules/indexers/repository.js';
import { TestClock } from './helpers.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

let database: DatabaseHandle;
let clock: TestClock;
let indexers: IndexerRepository;
let budget: IndexerBudget;

beforeEach(() => {
  database = openDatabase(':memory:');
  clock = new TestClock();
  indexers = new IndexerRepository(database.db, clock.fn);
  indexers.upsert({
    id: 'primary',
    name: 'Primary',
    url: 'https://indexer.example.invalid',
    priority: 0,
    searchLimitPerDay: 3,
    grabLimitPerDay: 2,
  });
  budget = new IndexerBudget(database.db, clock.fn);
});

const ok = () => Promise.resolve('result');

async function spendN(n: number, kind: 'search' | 'grab' = 'search', stepMs = 0) {
  for (let i = 0; i < n; i++) {
    await budget.spend('primary', kind, ok);
    if (stepMs) clock.advance(stepMs);
  }
}

describe('IndexerBudget.status', () => {
  it('starts with the full limit and a free slot now', () => {
    expect(budget.status('primary', 'search')).toEqual({
      limit: 3,
      used: 0,
      left: 3,
      nextFreeAt: clock.now,
      limitReachedUntil: null,
    });
  });

  it('throws for an unknown indexer', () => {
    expect(() => budget.status('nope', 'search')).toThrow(UnknownIndexerError);
  });
});

describe('IndexerBudget.spend', () => {
  it('runs the call, returns its result and records one event', async () => {
    await expect(budget.spend('primary', 'search', ok)).resolves.toBe('result');
    expect(budget.status('primary', 'search')).toMatchObject({ used: 1, left: 2 });
    expect(database.db.select().from(budgetEvents).all()).toEqual([
      { id: 1, indexerId: 'primary', kind: 'search', at: clock.now },
    ]);
  });

  it('keeps separate counters for searches and grabs', async () => {
    await spendN(2, 'search');
    await spendN(1, 'grab');
    expect(budget.status('primary', 'search')).toMatchObject({ used: 2, left: 1 });
    expect(budget.status('primary', 'grab')).toMatchObject({ used: 1, left: 1 });
  });

  it('refuses to spend past the limit without calling the indexer', async () => {
    await spendN(3);
    let called = false;
    const err = await budget
      .spend('primary', 'search', async () => {
        called = true;
      })
      .catch((e: unknown) => e);
    expect(called).toBe(false);
    expect(err).toBeInstanceOf(BudgetExhaustedError);
    expect(err).toMatchObject({
      indexerId: 'primary',
      kind: 'search',
      nextFreeAt: new Date(clock.now.getTime() + BUDGET_WINDOW_MS),
    });
    expect(budget.status('primary', 'search').used).toBe(3);
  });

  it('frees a slot exactly 24 hours after the oldest call in the window', async () => {
    const start = clock.now.getTime();
    await spendN(3, 'search', 10 * MIN); // at 0, 10 and 20 minutes
    expect(budget.status('primary', 'search')).toMatchObject({
      left: 0,
      nextFreeAt: new Date(start + DAY),
    });
    clock.now = new Date(start + DAY - 1);
    expect(budget.status('primary', 'search').left).toBe(0);
    clock.now = new Date(start + DAY);
    expect(budget.status('primary', 'search')).toMatchObject({ used: 2, left: 1 });
    await expect(budget.spend('primary', 'search', ok)).resolves.toBe('result');
    expect(budget.status('primary', 'search')).toMatchObject({
      left: 0,
      nextFreeAt: new Date(start + DAY + 10 * MIN),
    });
  });

  it('counts a call that failed: the request went out', async () => {
    await expect(
      budget.spend('primary', 'search', () => Promise.reject(new Error('timeout'))),
    ).rejects.toThrow('timeout');
    expect(budget.status('primary', 'search').used).toBe(1);
  });

  it('handles a limit lowered below what was already spent', async () => {
    const start = clock.now.getTime();
    await spendN(3, 'search', 5 * MIN); // at 0, 5, 10
    indexers.upsert({ ...indexers.get('primary')!, searchLimitPerDay: 1 });
    // All three calls must leave the window before one is free: the last at 10 minutes.
    expect(budget.status('primary', 'search')).toEqual({
      limit: 1,
      used: 3,
      left: 0,
      nextFreeAt: new Date(start + DAY + 10 * MIN),
      limitReachedUntil: null,
    });
  });

  it('never spends on an indexer with a limit of 0', async () => {
    indexers.upsert({ ...indexers.get('primary')!, grabLimitPerDay: 0 });
    await expect(budget.spend('primary', 'grab', ok)).rejects.toBeInstanceOf(BudgetExhaustedError);
  });

  it('throws for an unknown indexer without calling anything', async () => {
    let called = false;
    await expect(
      budget.spend('nope', 'search', async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(UnknownIndexerError);
    expect(called).toBe(false);
  });

  it('keeps its counts across a restart (persisted)', async () => {
    await spendN(2);
    const again = new IndexerBudget(database.db, clock.fn);
    expect(again.status('primary', 'search').used).toBe(2);
  });

  it('forgets events older than two days', async () => {
    await spendN(1);
    clock.advance(2 * DAY + MIN);
    await spendN(1);
    expect(database.db.select().from(budgetEvents).all()).toHaveLength(1);
  });
});

describe("the indexer's own limit-reached error", () => {
  it('blocks spending for the rest of the window and rethrows', async () => {
    const start = clock.now.getTime();
    const limitErr = new IndexerLimitReachedError('Request limit reached');
    await expect(budget.spend('primary', 'search', () => Promise.reject(limitErr))).rejects.toBe(
      limitErr,
    );
    const until = new Date(start + BUDGET_WINDOW_MS);
    expect(budget.status('primary', 'search')).toEqual({
      limit: 3,
      used: 1,
      left: 0,
      nextFreeAt: until,
      limitReachedUntil: until,
    });
    // Grabs have their own counter and are not blocked by a search limit.
    expect(budget.status('primary', 'grab').left).toBe(2);

    let called = false;
    const err = await budget
      .spend('primary', 'search', async () => {
        called = true;
      })
      .catch((e: unknown) => e);
    expect(called).toBe(false);
    expect(err).toMatchObject({ name: 'BudgetExhaustedError', nextFreeAt: until });
  });

  it('uses the retry time the indexer gave', async () => {
    const retryAt = new Date(clock.now.getTime() + 10 * MIN);
    await budget
      .spend('primary', 'grab', () =>
        Promise.reject(new IndexerLimitReachedError('Download limit reached', retryAt)),
      )
      .catch(() => undefined);
    expect(budget.status('primary', 'grab')).toMatchObject({
      left: 0,
      nextFreeAt: retryAt,
      limitReachedUntil: retryAt,
    });
    clock.now = retryAt;
    expect(budget.status('primary', 'grab')).toMatchObject({
      left: 1,
      nextFreeAt: retryAt,
      limitReachedUntil: null,
    });
    await expect(budget.spend('primary', 'grab', ok)).resolves.toBe('result');
  });

  it('keeps the later of a block and a full window', async () => {
    const start = clock.now.getTime();
    await spendN(3, 'search');
    clock.advance(30 * MIN);
    budget.reportLimitReached('primary', 'search', 'limit', new Date(start + 40 * MIN));
    // The block ends at 40 minutes, but the window is full until 60.
    expect(budget.status('primary', 'search')).toMatchObject({
      left: 0,
      nextFreeAt: new Date(start + DAY),
      limitReachedUntil: new Date(start + 40 * MIN),
    });
    clock.now = new Date(start + 40 * MIN);
    expect(budget.status('primary', 'search')).toMatchObject({
      left: 0,
      nextFreeAt: new Date(start + DAY),
      limitReachedUntil: null,
    });
  });

  it('replaces an earlier block for the same counter', () => {
    budget.reportLimitReached('primary', 'search', 'first', new Date(clock.now.getTime() + MIN));
    budget.reportLimitReached('primary', 'search', 'second');
    expect(budget.status('primary', 'search').limitReachedUntil).toEqual(
      new Date(clock.now.getTime() + BUDGET_WINDOW_MS),
    );
  });

  it('ignores a retry time in the past', () => {
    budget.reportLimitReached('primary', 'search', 'x', new Date(clock.now.getTime() - MIN));
    expect(budget.status('primary', 'search').limitReachedUntil).toEqual(
      new Date(clock.now.getTime() + BUDGET_WINDOW_MS),
    );
  });

  it('refuses to block an unknown indexer', () => {
    expect(() => budget.reportLimitReached('nope', 'search', 'x')).toThrow(UnknownIndexerError);
  });
});

describe('IndexerBudget.overview', () => {
  it('lists every indexer in priority order with both counters', async () => {
    indexers.upsert({
      id: 'backup',
      name: 'Backup',
      url: 'https://backup.example.invalid',
      priority: -1,
      searchLimitPerDay: 10,
      grabLimitPerDay: 10,
    });
    await spendN(1);
    const overview = budget.overview();
    expect(overview.map((o) => o.indexer.id)).toEqual(['backup', 'primary']);
    expect(overview[1]).toMatchObject({ search: { used: 1, left: 2 }, grab: { used: 0 } });
  });
});
