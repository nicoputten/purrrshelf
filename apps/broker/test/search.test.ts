import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { releases, searchAttempts } from '../src/db/schema.js';
import { RESUME_SEARCH_JOB } from '../src/modules/requests/service.js';
import { InvalidTransitionError } from '../src/modules/requests/status.js';
import { fixture } from './fake-newznab.js';
import { QUERY, fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const MIN = 60_000;
const HOST = 'indexer.example.invalid';
const BACKUP = 'backup.example.invalid';
let h: Harness;

beforeEach(async () => {
  h = await makeHarness();
  h.indexers.upsert(indexerInput());
});

function add(query = QUERY) {
  return h.requests.add({ userId: h.userId, workId: 'work-1', query, pushTo: [h.userId] });
}

function attempts(requestId: string) {
  return h.database.db
    .select()
    .from(searchAttempts)
    .where(eq(searchAttempts.requestId, requestId))
    .all();
}

describe('library check', () => {
  it('costs 0 indexer calls for a book we already have', async () => {
    h.library.books.set(QUERY.title, 77);
    const req = await add();
    expect(req).toMatchObject({ status: 'in_library', calibreBookId: 77 });
    expect(h.calls()).toBe(0);
    expect(h.budget.status('primary', 'search').used).toBe(0);
  });
});

describe('query variants', () => {
  it('stops at the first variant with an acceptable hit', async () => {
    // Variant 1 (author + title) finds nothing, variant 2 (title) hits.
    fakeFor(h, HOST).on('search:The Lighthouse Cartographer', { body: fixture('search-hit.xml') });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(fakeFor(h, HOST).calls.map((u) => u.searchParams.get('q'))).toEqual([
      'Ada Quill The Lighthouse Cartographer',
      'The Lighthouse Cartographer',
    ]);
    expect(attempts(req.id)).toMatchObject([
      { variant: 'author_title', resultCount: 0, hit: false, cost: 1, error: null },
      { variant: 'title', resultCount: 3, hit: true, cost: 1 },
    ]);
    // Every result is kept for "Pick another".
    const rows = h.database.db.select().from(releases).where(eq(releases.requestId, req.id)).all();
    expect(rows.map((r) => [r.title, r.format])).toEqual([
      ['Ada Quill - The Lighthouse Cartographer (2021) EPUB', 'epub'],
      ['The Lighthouse Cartographer Audiobook MP3', null],
      ['Unrelated Book PDF', 'pdf'],
    ]);
    expect(h.budget.status('primary', 'search').used).toBe(2);
  });

  it('uses t=book first once caps are known', async () => {
    h.indexers.setCaps(
      'primary',
      JSON.stringify({ bookSearch: true, bookParams: ['title', 'author'] }),
    );
    fakeFor(h, HOST).on('book', { body: fixture('search-hit.xml') });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(fakeFor(h, HOST).calls).toHaveLength(1);
    expect(fakeFor(h, HOST).calls[0]!.searchParams.get('t')).toBe('book');
  });

  it('adapts the order by hit rate', async () => {
    fakeFor(h, HOST).on('search:The Lighthouse Cartographer', { body: fixture('search-hit.xml') });
    await add();
    await add();
    // author_title: 2 misses, title: 2 hits → title now goes first.
    const fake = fakeFor(h, HOST);
    fake.calls.length = 0;
    await add();
    expect(fake.calls.map((u) => u.searchParams.get('q'))).toEqual(['The Lighthouse Cartographer']);
  });

  it('ends in not_found when no variant hits, having spent one call per variant', async () => {
    const req = await add();
    expect(req).toMatchObject({
      status: 'not_found',
      error: 'No acceptable release on any indexer',
    });
    expect(h.calls()).toBe(3);
    expect(attempts(req.id).map((a) => a.variant)).toEqual(['author_title', 'title', 'isbn']);
  });

  it('ends in not_found without any indexer, or with all switched off', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 0 }));
    expect(await add()).toMatchObject({ status: 'not_found', error: 'No indexer is configured' });
    h.indexers.remove('primary');
    expect(await add()).toMatchObject({ status: 'not_found', error: 'No indexer is configured' });
    expect(h.calls()).toBe(0);
  });
});

describe('several indexers', () => {
  beforeEach(() => {
    h.indexers.upsert(indexerInput({ id: 'backup', url: `https://${BACKUP}`, priority: 1 }));
  });

  it('queries them one at a time, in priority order', async () => {
    const order: string[] = [];
    for (const host of [HOST, BACKUP]) {
      fakeFor(h, host).fallback = { body: fixture('search-empty.xml') };
      const fake = fakeFor(h, host);
      const original = fake.fetch;
      let inFlight = 0;
      (fake as { fetch: typeof original }).fetch = async (url, init) => {
        order.push(host);
        inFlight++;
        expect(inFlight).toBe(1);
        const res = await original(url, init);
        inFlight--;
        return res;
      };
    }
    fakeFor(h, BACKUP).on('search:The Lighthouse Cartographer', {
      body: fixture('search-hit.xml'),
    });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(order).toEqual([HOST, HOST, HOST, BACKUP, BACKUP]);
  });

  it('skips an indexer whose key is missing and records why', async () => {
    delete h.env.INDEXER_PRIMARY_API_KEY;
    fakeFor(h, BACKUP).on('search', { body: fixture('search-hit.xml') });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(attempts(req.id)[0]).toMatchObject({
      indexerId: 'primary',
      error: 'Set INDEXER_PRIMARY_API_KEY in the broker environment',
    });
    expect(fakeFor(h, HOST).calls).toHaveLength(0);
  });

  it('moves on after an indexer error', async () => {
    fakeFor(h, HOST).fallback = { status: 503, body: '<html/>' };
    fakeFor(h, BACKUP).on('search', { body: fixture('search-hit.xml') });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(fakeFor(h, HOST).calls).toHaveLength(1);
  });
});

describe('empty budget', () => {
  it('waits, then runs automatically when a slot frees up, without repeating spent variants', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 1 }));
    const start = h.clock.now.getTime();
    fakeFor(h, HOST).on('search:The Lighthouse Cartographer', { body: fixture('search-hit.xml') });

    const req = await add();
    expect(req.status).toBe('waiting_budget');
    expect(h.calls()).toBe(1);
    const [job] = h.jobs.pending(RESUME_SEARCH_JOB);
    expect(job).toMatchObject({ runAt: new Date(start + 60 * MIN) });

    // Nothing runs before the slot is free.
    h.clock.advance(59 * MIN);
    expect(await h.jobs.runDue()).toBe(0);
    expect(h.calls()).toBe(1);

    h.clock.advance(MIN);
    expect(await h.jobs.runDue()).toBe(1);
    expect(h.requests.get(req.id).status).toBe('choose_release');
    expect(attempts(req.id).map((a) => a.variant)).toEqual(['author_title', 'title']);
    expect(h.jobs.pending(RESUME_SEARCH_JOB)).toEqual([]);
  });

  it("stops at the indexer's own limit error and waits for its retry time", async () => {
    fakeFor(h, HOST).fallback = { body: fixture('error-limit.xml') };
    const req = await add();
    expect(req.status).toBe('waiting_budget');
    expect(h.calls()).toBe(1);
    expect(attempts(req.id)[0]).toMatchObject({ error: 'Request limit reached', cost: 1 });
    expect(h.jobs.pending(RESUME_SEARCH_JOB)[0]!.runAt).toEqual(
      new Date(h.clock.now.getTime() + 60 * MIN),
    );
  });

  it('waits for the earliest indexer that frees up', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 0 }));
    h.indexers.upsert(
      indexerInput({ id: 'backup', url: `https://${BACKUP}`, priority: 1, searchLimitPerHour: 1 }),
    );
    await h.budget.spend('backup', 'search', async () => undefined);
    h.clock.advance(10 * MIN);
    const req = await add();
    expect(req.status).toBe('waiting_budget');
    expect(h.calls()).toBe(0);
    expect(h.jobs.pending(RESUME_SEARCH_JOB)[0]!.runAt).toEqual(
      new Date(h.clock.now.getTime() + 50 * MIN),
    );
  });

  it('picks the earlier of two indexers that are both out of budget', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 1 }));
    h.indexers.upsert(
      indexerInput({ id: 'backup', url: `https://${BACKUP}`, priority: 1, searchLimitPerHour: 1 }),
    );
    const start = h.clock.now.getTime();
    await h.budget.spend('primary', 'search', async () => undefined);
    h.clock.advance(10 * MIN);
    await h.budget.spend('backup', 'search', async () => undefined);
    expect((await add()).status).toBe('waiting_budget');
    expect(h.jobs.pending(RESUME_SEARCH_JOB)[0]!.runAt).toEqual(new Date(start + 60 * MIN));
    // And the other way round.
    h.indexers.upsert(indexerInput({ priority: 2, searchLimitPerHour: 1 }));
    await add();
    expect(h.jobs.pending(RESUME_SEARCH_JOB).map((j) => j.runAt)).toEqual([
      new Date(start + 60 * MIN),
      new Date(start + 60 * MIN),
    ]);
  });

  it('keeps waiting when the slot is taken again before the job runs', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 1 }));
    const req = await add();
    expect(req.status).toBe('waiting_budget');
    h.clock.advance(60 * MIN);
    // Someone else spends the freed slot first.
    await h.budget.spend('primary', 'search', async () => undefined);
    await h.jobs.runDue();
    expect(h.requests.get(req.id).status).toBe('waiting_budget');
    expect(h.jobs.pending(RESUME_SEARCH_JOB)).toHaveLength(1);
  });

  it('does nothing for a request cancelled while waiting', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 1 }));
    await h.budget.spend('primary', 'search', async () => undefined);
    const req = await add();
    h.requests.cancel(req.id);
    h.clock.advance(60 * MIN);
    expect(await h.jobs.runDue()).toBe(1);
    expect(h.calls()).toBe(0);
    expect(h.requests.get(req.id).status).toBe('cancelled');
    expect(h.jobs.pending(RESUME_SEARCH_JOB)).toEqual([]);
  });
});

describe('Try again', () => {
  it('starts a new, paid round with every variant', async () => {
    const req = await add();
    expect(req.status).toBe('not_found');
    h.clock.advance(MIN);
    fakeFor(h, HOST).on('search', { body: fixture('search-hit.xml') });
    const again = await h.requests.retry(req.id);
    expect(again).toMatchObject({ status: 'choose_release', error: null });
    expect(h.calls()).toBe(4);
  });

  it('is refused while waiting for budget', async () => {
    h.indexers.upsert(indexerInput({ searchLimitPerHour: 1 }));
    await h.budget.spend('primary', 'search', async () => undefined);
    const req = await add();
    await expect(h.requests.retry(req.id)).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('keeps failed releases when replacing candidates', async () => {
    fakeFor(h, HOST).on('search', { body: fixture('search-hit.xml') });
    const req = await add();
    h.database.db
      .update(releases)
      .set({ status: 'failed' })
      .where(eq(releases.guid, 'bbb222'))
      .run();
    await h.requests.retry(req.id);
    const rows = h.database.db.select().from(releases).where(eq(releases.requestId, req.id)).all();
    expect(rows.filter((r) => r.status === 'failed').map((r) => r.guid)).toEqual(['bbb222']);
    expect(rows.filter((r) => r.status === 'candidate')).toHaveLength(3);
  });
});

describe('RequestService', () => {
  it('stores the request with media type and push targets', async () => {
    const req = await add();
    expect(req).toMatchObject({
      userId: h.userId,
      workId: 'work-1',
      language: 'en',
      mediaType: 'ebook',
      pushToJson: JSON.stringify([h.userId]),
    });
  });

  it('rejects an invalid query', async () => {
    await expect(add({ ...QUERY, title: '' })).rejects.toThrow();
  });

  it('turns an unexpected search failure into not_found with the message', async () => {
    h.library.findBook = () => Promise.reject(new Error('library down'));
    expect(await add()).toMatchObject({ status: 'not_found', error: 'library down' });
    h.library.findBook = () => Promise.reject('plain');
    expect(await add()).toMatchObject({ status: 'not_found', error: 'plain' });
  });

  it('throws for an unknown request', () => {
    expect(() => h.requests.get('nope')).toThrow('No request "nope"');
  });
});
