import { describe, expect, it } from 'vitest';
import {
  coverUrls,
  flatten,
  mergeResults,
  toSummary,
  type MergedWork,
} from '../src/modules/discover/merge.js';
import type { ProviderWork } from '../src/modules/discover/types.js';

function work(
  over: Partial<ProviderWork> & Pick<ProviderWork, 'provider' | 'id' | 'title'>,
): ProviderWork {
  return {
    subtitle: null,
    authors: [],
    language: null,
    series: null,
    publishedYear: null,
    isbns: [],
    coverUrl: null,
    ...over,
  };
}

describe('mergeResults', () => {
  it('merges by ISBN first, even when titles differ', () => {
    const groups = mergeResults([
      [work({ provider: 'hardcover', id: '1', title: 'The Salt Road', isbns: ['9780000000026'] })],
      [
        work({
          provider: 'openlibrary',
          id: 'OL1W',
          title: 'Salt Road (special edition)',
          authors: ['X'],
          isbns: ['9780000000026'],
        }),
      ],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sources.map((s) => s.provider)).toEqual(['hardcover', 'openlibrary']);
  });

  it('then by normalised title + author', () => {
    const groups = mergeResults([
      [work({ provider: 'hardcover', id: '1', title: 'Max Havelaar', authors: ['Multatuli'] })],
      [],
      [
        work({
          provider: 'googlebooks',
          id: 'g1',
          title: 'MAX HAVELAAR: of de koffij-veilingen',
          authors: ['Multatuli'],
          isbns: ['9780000000057'],
        }),
        work({
          provider: 'googlebooks',
          id: 'g2',
          title: 'Max Havelaar',
          authors: ['Someone Else'],
        }),
      ],
    ]);
    expect(groups.map((g) => g.sources.map((s) => s.id))).toEqual([['1', 'g1'], ['g2']]);
  });

  it('keeps one record per provider in a group', () => {
    const groups = mergeResults([
      [
        work({ provider: 'openlibrary', id: 'OL1W', title: 'A', authors: ['B'] }),
        work({ provider: 'openlibrary', id: 'OL2W', title: 'A', authors: ['B'] }),
      ],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sources).toHaveLength(1);
  });

  it('links a later record by ISBN learned from a merged one', () => {
    const groups = mergeResults([
      [work({ provider: 'hardcover', id: '1', title: 'A', authors: ['B'] })],
      [
        work({
          provider: 'openlibrary',
          id: 'OL1W',
          title: 'A',
          authors: ['B'],
          isbns: ['9780000000019'],
        }),
      ],
      [work({ provider: 'googlebooks', id: 'g', title: 'Other title', isbns: ['9780000000019'] })],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sources).toHaveLength(3);
  });
});

describe('flatten and toSummary', () => {
  const group: MergedWork = {
    sources: [
      work({
        provider: 'hardcover',
        id: '1',
        title: 'A',
        authors: ['B'],
        isbns: ['9780000000019'],
        series: { id: null, name: 'S', position: 1, total: null },
      }),
      work({
        provider: 'openlibrary',
        id: 'OL1W',
        title: 'A',
        subtitle: 'Sub',
        language: 'en',
        isbns: ['9780000000019', '9780000000026'],
        coverUrl: 'https://c.example.invalid/1.jpg',
        series: { id: 'hardcover:9', name: 'S', position: 1, total: 2 },
      }),
      work({
        provider: 'googlebooks',
        id: 'g',
        title: 'A',
        coverUrl: 'https://c.example.invalid/2.jpg',
        publishedYear: 2001,
        description: 'D',
      }),
    ],
  };

  it('takes each field from the best source that has it', () => {
    const flat = flatten(group);
    expect(flat).toMatchObject({
      id: '1',
      subtitle: 'Sub',
      language: 'en',
      publishedYear: 2001,
      coverUrl: 'https://c.example.invalid/1.jpg',
      description: 'D',
      isbns: ['9780000000019', '9780000000026'],
    });
    // A series with an id beats one without.
    expect(flat.series?.id).toBe('hardcover:9');
  });

  it('carries the low-odds facts: first date, all languages, Hardcover readers (BRK-13)', () => {
    const flat = flatten({
      sources: [
        work({ provider: 'openlibrary', id: 'OL9W', title: 'A', languages: ['nl'], readers: 99 }),
        work({
          provider: 'hardcover',
          id: '9',
          title: 'A',
          releaseDate: '2026-01-02',
          languages: ['nl', 'en'],
          readers: 4,
        }),
        work({ provider: 'googlebooks', id: 'g', title: 'A', releaseDate: '2026-01-05' }),
      ],
    });
    expect(flat).toMatchObject({ releaseDate: '2026-01-02', languages: ['nl', 'en'], readers: 4 });
    expect(
      flatten({ sources: [work({ provider: 'openlibrary', id: 'x', title: 'A' })] }),
    ).toMatchObject({
      releaseDate: null,
      languages: [],
      readers: null,
    });
  });

  it('lists every cover URL, best first', () => {
    expect(coverUrls(group)).toEqual([
      'https://c.example.invalid/1.jpg',
      'https://c.example.invalid/2.jpg',
    ]);
  });

  it('builds the API summary with sources and library state', () => {
    const summary = toSummary(group, null);
    expect(summary).toMatchObject({
      id: 'hardcover:1',
      mediaType: 'ebook',
      hasCover: true,
      library: null,
    });
    expect(summary.sources).toEqual([
      { provider: 'hardcover', id: '1' },
      { provider: 'openlibrary', id: 'OL1W' },
      { provider: 'googlebooks', id: 'g' },
    ]);
  });
});
