import { describe, expect, it } from 'vitest';
import { IndexerLimitReachedError } from '../src/modules/budget/budget.js';
import { IndexerRequestError, NewznabClient } from '../src/modules/budget/newznab.js';
import { FakeNewznab, fixture } from './fake-newznab.js';

const endpoint = { url: 'https://indexer.example.invalid', apiKey: 'fake-key' };
const now = new Date('2026-01-01T12:00:00.000Z');

function client(fake: FakeNewznab) {
  return new NewznabClient(fake.fetch, () => now);
}

describe('NewznabClient.search', () => {
  it('sends the params with the key and parses items', async () => {
    const fake = new FakeNewznab().on('search', { body: fixture('search-hit.xml') });
    const items = await client(fake).search(endpoint, { t: 'search', q: 'x', cat: '7020' });
    const url = fake.calls[0]!;
    expect(url.origin + url.pathname).toBe('https://indexer.example.invalid/api');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      extended: '1',
      limit: '100',
      t: 'search',
      q: 'x',
      cat: '7020',
      apikey: 'fake-key',
    });
    expect(items).toEqual([
      {
        guid: 'https://indexer.example.invalid/details/aaa111',
        title: 'Ada Quill - The Lighthouse Cartographer (2021) EPUB',
        size: 2400000,
        category: '7020',
        grabs: 42,
        language: 'English',
        publishedAt: new Date('2021-03-01T10:00:00Z'),
      },
      {
        guid: 'bbb222',
        title: 'The Lighthouse Cartographer Audiobook MP3',
        size: 350000000,
        category: null,
        grabs: null,
        language: null,
        publishedAt: null,
      },
      {
        guid: 'ccc333',
        title: 'Unrelated Book PDF',
        size: null,
        category: null,
        grabs: null,
        language: null,
        publishedAt: null,
      },
    ]);
  });

  it('answers an empty list for an empty feed', async () => {
    const fake = new FakeNewznab();
    expect(await client(fake).search(endpoint, { t: 'search', q: 'x' })).toEqual([]);
  });

  it('uses the link as guid when it has no id', async () => {
    const body = `<rss><channel><item><title>T</title><link>https://indexer.example.invalid/nzb/1</link><newznab:attr name="size" value="huge"/></item></channel></rss>`;
    const fake = new FakeNewznab().on('search', { body });
    expect(await client(fake).search(endpoint, { t: 'search' })).toMatchObject([
      { guid: 'https://indexer.example.invalid/nzb/1', size: null },
    ]);
  });

  it('skips items without any guid or link', async () => {
    const body = `<rss><channel><item><title>T</title></item></channel></rss>`;
    const fake = new FakeNewznab().on('search', { body });
    expect(await client(fake).search(endpoint, { t: 'search' })).toEqual([]);
  });

  it('turns error 500 into IndexerLimitReachedError', async () => {
    const fake = new FakeNewznab().on('search', { body: fixture('error-limit.xml') });
    const err = await client(fake)
      .search(endpoint, { t: 'search' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerLimitReachedError);
    expect(err).toMatchObject({ message: 'Request limit reached', retryAt: undefined });
  });

  it('uses a default description when the error has none', async () => {
    const fake = new FakeNewznab().on('search', { body: '<error code="501"/>' });
    await expect(client(fake).search(endpoint, { t: 'search' })).rejects.toThrow('Indexer error');
  });

  it.each([
    [{ 'retry-after': '120' }, new Date(now.getTime() + 120_000)],
    [{ 'retry-after': 'Thu, 01 Jan 2026 13:00:00 GMT' }, new Date('2026-01-01T13:00:00Z')],
    [{ 'retry-after': 'soon' }, undefined],
    [{}, undefined],
  ])('turns HTTP 429 into a limit with retry time (%j)', async (headers, retryAt) => {
    const fake = new FakeNewznab().on('search', { status: 429, body: '', headers });
    const err = await client(fake)
      .search(endpoint, { t: 'search' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerLimitReachedError);
    expect((err as IndexerLimitReachedError).retryAt).toEqual(retryAt);
  });

  it.each([
    ['other error codes', { body: fixture('error-key.xml') }, /Indexer error 100: Incorrect/],
    ['HTTP errors', { status: 502, body: '<html></html>' }, /HTTP 502/],
    ['a non-feed reply', { body: '<html><body>hi</body></html>' }, /not a Newznab feed/],
    ['broken XML', { body: '<rss><channel>' }, /not XML/],
  ])('reports %s as IndexerRequestError', async (_l, reply, message) => {
    const fake = new FakeNewznab().on('search', reply);
    const err = await client(fake)
      .search(endpoint, { t: 'search' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(IndexerRequestError);
    expect((err as Error).message).toMatch(message);
  });

  it('reports a network failure as IndexerRequestError', async () => {
    const c = new NewznabClient(
      () => Promise.reject(new Error('ECONNREFUSED')),
      () => now,
    );
    await expect(c.search(endpoint, { t: 'search' })).rejects.toThrow('Indexer not reachable');
  });
});

describe('NewznabClient.caps', () => {
  it('reads book-search support', async () => {
    const fake = new FakeNewznab().on('caps', { body: fixture('caps.xml') });
    expect(await client(fake).caps(endpoint)).toEqual({
      bookSearch: true,
      bookParams: ['q', 'title', 'author'],
    });
  });

  it('handles an indexer without book search', async () => {
    const fake = new FakeNewznab().on('caps', { body: '<caps><searching/></caps>' });
    expect(await client(fake).caps(endpoint)).toEqual({ bookSearch: false, bookParams: [] });
    fake.on('caps', { body: '<caps></caps>' });
    expect(await client(fake).caps(endpoint)).toEqual({ bookSearch: false, bookParams: [] });
  });

  it('rejects a reply that is not caps', async () => {
    const fake = new FakeNewznab().on('caps', { body: '<rss/>' });
    await expect(client(fake).caps(endpoint)).rejects.toThrow('not a caps document');
  });
});

describe('NewznabClient.nzb', () => {
  it('downloads the NZB by guid', async () => {
    const fake = new FakeNewznab().on('get', { body: fixture('release.nzb') });
    const nzb = await client(fake).nzb(endpoint, 'aaa111');
    expect(nzb.toString('utf8')).toContain('<nzb');
    expect(fake.calls[0]!.searchParams.get('id')).toBe('aaa111');
  });

  it('turns a download-limit error into IndexerLimitReachedError', async () => {
    const fake = new FakeNewznab().on('get', {
      body: '<error code="501" description="Download limit reached"/>',
    });
    await expect(client(fake).nzb(endpoint, 'x')).rejects.toBeInstanceOf(IndexerLimitReachedError);
  });

  it.each([
    [{ body: 'just text' }, /did not return an NZB/],
    [{ status: 404, body: 'not found' }, /HTTP 404/],
    [{ status: 500, body: fixture('release.nzb') }, /HTTP 500/],
    [{ body: '<<<' }, /did not return an NZB/],
  ])('reports a bad NZB reply %#', async (reply, message) => {
    const fake = new FakeNewznab().on('get', reply);
    await expect(client(fake).nzb(endpoint, 'x')).rejects.toThrow(message);
  });
});
