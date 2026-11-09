import type { WorkSummary } from '@purrshelf/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import { AppError } from '../../src/errors.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import { fetchAppleChart, splitAuthors } from '../../src/modules/charts/apple.js';
import { appleGenres, hardcoverGenres, splitByGenre } from '../../src/modules/charts/genres.js';
import {
  ChartService,
  REFRESH_MS,
  regionsFor,
  type ChartDeps,
  type ChartWorks,
} from '../../src/modules/charts/service.js';
import { MetadataCache } from '../../src/modules/discover/cache.js';
import { ProviderError } from '../../src/modules/discover/http.js';
import { PASSWORD, TestClock } from '../helpers.js';
import { json } from '../metadata-fakes.js';

/** ChartService and its pure parts with fakes: the edges the API test doesn't reach. */

const summary = (id: string): WorkSummary => ({
  id,
  mediaType: 'ebook',
  title: `Title ${id}`,
  subtitle: null,
  authors: ['Ada Quillfeather'],
  language: 'en',
  series: null,
  publishedYear: 2020,
  isbns: [],
  hasCover: true,
  sources: [{ provider: 'hardcover', id: id.split(':')[1]! }],
  library: null,
});

describe('genres', () => {
  it('maps Apple genre ids, main genre or sub-genre', () => {
    expect(appleGenres([38, 9031, 9032, 10061])).toEqual(['thriller', 'romance']);
    expect(appleGenres([38, 9031])).toEqual([]);
    expect(appleGenres([9008, 9015])).toEqual(['biography', 'nonfiction']);
  });

  it('maps Hardcover tags case-insensitively, whole tag only', () => {
    expect(hardcoverGenres([' Science  Fiction', 'Mystery', 'Fictional Fantasy'])).toEqual([
      'thriller',
      'fantasy_scifi',
    ]);
    expect(hardcoverGenres([])).toEqual([]);
  });

  it('cuts genre lists with ranks from 1, leaving out empty genres', () => {
    const ranked = [
      { id: 'a', genres: ['thriller' as const] },
      { id: 'b', genres: [] },
      { id: 'c', genres: ['thriller' as const, 'romance' as const] },
    ];
    expect(
      splitByGenre(ranked, 2).map((l) => [l.genre, l.items.map((i) => `${i.rank}${i.entry.id}`)]),
    ).toEqual([
      ['all', ['1a', '2b']],
      ['thriller', ['1a', '2c']],
      ['romance', ['1c']],
    ]);
  });
});

describe('Apple feed', () => {
  const http = (handler: () => Response | Promise<Response>) => ({
    fetch: vi.fn(async () => handler()),
    timeoutMs: 1000,
  });

  it('splits author names', () => {
    expect(splitAuthors('A. Writer, B. Writer & C. Writer')).toEqual([
      'A. Writer',
      'B. Writer',
      'C. Writer',
    ]);
    expect(splitAuthors(null)).toEqual([]);
  });

  it('reads entries, dropping unusable ones and bad genres', async () => {
    const entries = await fetchAppleChart(
      http(() =>
        json({
          feed: {
            results: [
              { name: 'Book', artistName: 'Ann Author', genres: [{ genreId: '9032' }, null, 'x'] },
              { name: 'No genres' },
              { artistName: 'No title' },
            ],
          },
        }),
      ),
      'nl',
    );
    expect(entries).toEqual([
      { title: 'Book', authors: ['Ann Author'], genreIds: [9032] },
      { title: 'No genres', authors: [], genreIds: [] },
    ]);
  });

  it('throws a ProviderError for a reply it cannot read or a missing feed', async () => {
    await expect(
      fetchAppleChart(
        http(() => json({ nope: true })),
        'us',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      fetchAppleChart(
        http(() => json({}, 404)),
        'us',
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('puts the reader’s own country first', () => {
    expect(regionsFor('nl')).toEqual(['nl', 'us']);
    expect(regionsFor('en')).toEqual(['us', 'nl']);
  });
});

describe('ChartService', () => {
  let database: DatabaseHandle;
  let clock: TestClock;
  let userId: string;
  let works: { [K in keyof Omit<ChartWorks, 'hasTrending'>]: ReturnType<typeof vi.fn> } & {
    hasTrending: boolean;
  };
  let apple: ReturnType<typeof vi.fn>;
  let log: { warn: ReturnType<typeof vi.fn> };
  let service: ChartService;

  const make = () => {
    const users = new UserRepository(database.db, clock.fn);
    const deps: ChartDeps = {
      users,
      apple: apple as ChartDeps['apple'],
      works: works as unknown as ChartWorks,
      library: { match: async () => new Map() },
      openRequests: () => new Map(),
      cache: new MetadataCache(database.db, clock.fn, 30 * REFRESH_MS),
      clock: clock.fn,
      log: log as unknown as ChartDeps['log'],
    };
    return new ChartService(deps);
  };

  beforeEach(async () => {
    database = openDatabase(':memory:');
    clock = new TestClock();
    const users = new UserRepository(database.db, clock.fn);
    userId = (await users.create({ username: 'reader', displayName: 'Reader', password: PASSWORD }))
      .id;
    apple = vi.fn(async () => [{ title: 'Chart Book', authors: ['Ann Author'], genreIds: [9032] }]);
    works = {
      matchWork: vi.fn(async () => 'hardcover:1'),
      summary: vi.fn(async (id: string) => summary(id)),
      trending: vi.fn(async () => []),
      hasTrending: false,
    };
    log = { warn: vi.fn() };
    service = make();
  });

  afterEach(() => database.close());

  it('needs a known user', async () => {
    await expect(service.get('nobody')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('leaves out Hardcover trending when the server has no Hardcover token', async () => {
    const charts = await service.get(userId);
    expect(new Set(charts.charts.map((c) => c.source))).toEqual(new Set(['apple']));
    expect(works.trending).not.toHaveBeenCalled();
    // English reader: the US chart first.
    expect(charts.charts[0]!.region).toBe('us');
  });

  it('fetches a chart once when two readers look at the same time', async () => {
    await Promise.all([service.get(userId), service.get(userId)]);
    expect(apple).toHaveBeenCalledTimes(2); // us + nl, once each
  });

  it('keeps unmatched books, and a book a provider has no record of', async () => {
    works.matchWork
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new AppError(404, 'NOT_FOUND', 'No such book'));
    const charts = await service.get(userId);
    expect(charts.charts.filter((c) => c.genre === 'all').map((c) => c.items[0]!.work)).toEqual([
      null,
      null,
    ]);
  });

  it('treats a chart as failed when every match found the providers down', async () => {
    works.matchWork.mockRejectedValue(new AppError(502, 'METADATA_UNAVAILABLE', 'down'));
    await expect(service.get(userId)).rejects.toMatchObject({ code: 'METADATA_UNAVAILABLE' });
    expect(log.warn).toHaveBeenCalled();
  });

  it('logs an unexpected error as a failed refresh', async () => {
    works.matchWork.mockRejectedValue(new TypeError('bug'));
    await expect(service.get(userId)).rejects.toMatchObject({ code: 'METADATA_UNAVAILABLE' });
    expect(log.warn.mock.calls[0]![0].err).toBeInstanceOf(TypeError);
  });

  it('serves the last good chart, marked stale, when a refresh fails', async () => {
    await service.get(userId);
    clock.advance(REFRESH_MS + 1);
    apple.mockRejectedValue(new ProviderError('down'));
    const charts = await service.get(userId);
    expect(charts.stale).toBe(true);
    expect(charts.charts[0]!.items[0]!.work?.id).toBe('hardcover:1');
  });

  it('builds Hardcover trending lists from tags', async () => {
    works.hasTrending = true;
    works.trending.mockResolvedValue([
      { work: summary('hardcover:7'), tags: ['Romance'] },
      { work: summary('hardcover:8'), tags: [] },
    ]);
    service = make();
    const charts = await service.get(userId);
    const hc = charts.charts.filter((c) => c.source === 'hardcover');
    expect(hc.map((c) => [c.genre, c.items.map((i) => i.work?.id)])).toEqual([
      ['all', ['hardcover:7', 'hardcover:8']],
      ['romance', ['hardcover:7']],
    ]);
    expect(hc[0]!.region).toBeNull();
  });
});
