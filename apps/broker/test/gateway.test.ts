import { beforeEach, describe, expect, it } from 'vitest';
import { BudgetExhaustedError } from '../src/modules/budget/budget.js';
import { createIndexerGateway, MissingApiKeyError } from '../src/modules/budget/gateway.js';
import { fixture } from './fake-newznab.js';
import { fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const HOST = 'indexer.example.invalid';
let h: Harness;

beforeEach(async () => {
  h = await makeHarness();
  h.indexers.upsert(indexerInput({ searchLimitPerDay: 2, grabLimitPerDay: 1 }));
});

const primary = () => h.indexers.get('primary')!;

describe('IndexerGateway', () => {
  it('spends a search per search call', async () => {
    fakeFor(h, HOST).on('search', { body: fixture('search-hit.xml') });
    expect(await h.gateway.search(primary(), { t: 'search', q: 'x' })).toHaveLength(3);
    expect(h.budget.status('primary', 'search').used).toBe(1);
  });

  it('never calls the indexer once the budget is empty', async () => {
    await h.gateway.search(primary(), { t: 'search', q: 'a' });
    await h.gateway.search(primary(), { t: 'search', q: 'b' });
    await expect(h.gateway.search(primary(), { t: 'search', q: 'c' })).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );
    expect(h.calls()).toBe(2);
  });

  it('spends a grab per NZB download', async () => {
    fakeFor(h, HOST).on('get', { body: fixture('release.nzb') });
    expect((await h.gateway.grab(primary(), 'aaa111')).toString()).toContain('<nzb');
    expect(h.budget.status('primary', 'grab').used).toBe(1);
    await expect(h.gateway.grab(primary(), 'aaa111')).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(h.calls()).toBe(1);
  });

  it('reads caps once, paying a search, and caches them', async () => {
    fakeFor(h, HOST).on('caps', { body: fixture('caps.xml') });
    expect(await h.gateway.caps(primary())).toMatchObject({ bookSearch: true });
    expect(JSON.parse(primary().capsJson!)).toEqual({
      bookSearch: true,
      bookParams: ['q', 'title', 'author'],
    });
    expect(h.budget.status('primary', 'search').used).toBe(1);
  });

  it('refuses without an API key and spends nothing', async () => {
    delete h.env.INDEXER_PRIMARY_API_KEY;
    const err = await h.gateway.search(primary(), { t: 'search' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingApiKeyError);
    expect(err).toMatchObject({ envName: 'INDEXER_PRIMARY_API_KEY' });
    expect(h.budget.status('primary', 'search').used).toBe(0);
    expect(h.calls()).toBe(0);
  });

  it('reports when the indexer can search again', async () => {
    expect(h.gateway.nextFreeSearch(primary())).toEqual(h.clock.now);
  });
});

describe('createIndexerGateway', () => {
  it('uses the real fetch by default, still behind the budget', async () => {
    const gateway = createIndexerGateway({
      budget: h.budget,
      indexers: h.indexers,
      env: { INDEXER_PRIMARY_API_KEY: 'fake' },
      clock: h.clock.fn,
    });
    h.indexers.upsert(indexerInput({ searchLimitPerDay: 0 }));
    await expect(gateway.search(primary(), { t: 'search' })).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );
  });
});
