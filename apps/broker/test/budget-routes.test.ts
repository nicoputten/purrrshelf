import { afterEach, describe, expect, it } from 'vitest';
import { Budget, TokenPair } from '@purrshelf/contract';
import { IndexerBudget } from '../src/modules/budget/budget.js';
import { IndexerRepository } from '../src/modules/indexers/repository.js';
import { login, makeTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function getBudget(token?: string) {
  return ctx.app.inject({
    method: 'GET',
    url: '/api/v1/budget',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function token() {
  return TokenPair.parse((await login(ctx.app)).json()).accessToken;
}

describe('GET /api/v1/budget', () => {
  it('needs a login', async () => {
    ctx = await makeTestApp();
    const res = await getBudget();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('answers an empty list without indexers', async () => {
    ctx = await makeTestApp();
    const res = await getBudget(await token());
    expect(res.statusCode).toBe(200);
    expect(Budget.parse(res.json())).toEqual({
      windowMinutes: 1440,
      searches: { limit: 0, left: 0, nextFreeAt: null },
      indexers: [],
    });
  });

  it('returns searches and grabs left per indexer and the next free slot', async () => {
    ctx = await makeTestApp();
    const repo = new IndexerRepository(ctx.database.db, ctx.clock.fn);
    repo.upsert({
      id: 'primary',
      name: 'Primary',
      url: 'https://indexer.example.invalid',
      priority: 0,
      searchLimitPerDay: 2,
      grabLimitPerDay: 5,
    });
    repo.upsert({
      id: 'backup',
      name: 'Backup',
      url: 'https://backup.example.invalid',
      priority: 1,
      searchLimitPerDay: 1,
      grabLimitPerDay: 1,
    });
    const budget = new IndexerBudget(ctx.database.db, ctx.clock.fn);
    const start = ctx.clock.now.getTime();
    await budget.spend('primary', 'search', async () => undefined);
    await budget.spend('primary', 'search', async () => undefined);
    await budget.spend('primary', 'grab', async () => undefined);
    await budget.spend('backup', 'search', async () => undefined);
    ctx.clock.advance(5 * 60_000);

    const body = Budget.parse((await getBudget(await token())).json());
    const freeAt = new Date(start + 24 * 60 * 60_000).toISOString();
    // The scarcest indexer: both have 0 left, so the smaller limit.
    expect(body.searches).toEqual({ limit: 1, left: 0, nextFreeAt: freeAt });
    expect(body.indexers).toEqual([
      {
        indexerId: 'primary',
        name: 'Primary',
        priority: 0,
        searches: { limit: 2, used: 2, left: 0, nextFreeAt: freeAt, limitReachedUntil: null },
        grabs: {
          limit: 5,
          used: 1,
          left: 4,
          nextFreeAt: ctx.clock.now.toISOString(),
          limitReachedUntil: null,
        },
      },
      expect.objectContaining({
        indexerId: 'backup',
        searches: expect.objectContaining({ left: 0 }),
      }),
    ]);
    // Never leaks the indexer URL.
    expect(JSON.stringify(body)).not.toContain('example.invalid');
  });

  it('shows the earliest free search over all indexers', async () => {
    ctx = await makeTestApp();
    const repo = new IndexerRepository(ctx.database.db, ctx.clock.fn);
    for (const id of ['a', 'b']) {
      repo.upsert({
        id,
        name: id,
        url: 'https://indexer.example.invalid',
        priority: 0,
        searchLimitPerDay: 1,
        grabLimitPerDay: 1,
      });
    }
    const budget = new IndexerBudget(ctx.database.db, ctx.clock.fn);
    budget.reportLimitReached('a', 'search', 'limit', new Date(ctx.clock.now.getTime() + 60_000));
    const body = Budget.parse((await getBudget(await token())).json());
    expect(body.searches).toEqual({ limit: 1, left: 0, nextFreeAt: ctx.clock.now.toISOString() });
  });

  it('shows the scarcest active indexer in the pill, not a sum', async () => {
    ctx = await makeTestApp();
    const repo = new IndexerRepository(ctx.database.db, ctx.clock.fn);
    const add = (id: string, priority: number, searchLimitPerDay: number) =>
      repo.upsert({
        id,
        name: id,
        url: 'https://indexer.example.invalid',
        priority,
        searchLimitPerDay,
        grabLimitPerDay: 1,
      });
    add('small', 1, 3);
    add('big', 2, 200);
    add('off', 3, 0);
    const budget = new IndexerBudget(ctx.database.db, ctx.clock.fn);
    await budget.spend('small', 'search', async () => undefined);
    const body = Budget.parse((await getBudget(await token())).json());
    expect(body.searches).toMatchObject({ limit: 3, left: 2 });
  });
});
