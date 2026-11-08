import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  orderByHitRate,
  variantsFor,
  type BookQuery,
} from '../src/modules/search/planner.js';
import { normalise, titleMatchJudge } from '../src/modules/search/judge.js';

const query: BookQuery = {
  title: 'The Lighthouse Cartographer: A Novel',
  authors: ['Ada Quill', 'Second Author'],
  isbn13: '9780000000002',
  language: 'en',
};
const fullCaps = { bookSearch: true, bookParams: ['q', 'title', 'author'] };

describe('cleanTitle', () => {
  it.each([
    ['The Lighthouse Cartographer: A Novel', 'The Lighthouse Cartographer'],
    ['Salt and Ember (Tidewater #2)', 'Salt and Ember'],
    ['Salt and Ember [Tidewater 2]', 'Salt and Ember'],
    ['Night Garden - A Story', 'Night Garden'],
    ['Night Garden – Een verhaal', 'Night Garden'],
    ['Spider-Silk', 'Spider-Silk'],
  ])('%s → %s', (input, out) => {
    expect(cleanTitle(input)).toBe(out);
  });
});

describe('variantsFor', () => {
  it('runs t=book first when caps support it, then the free-text variants and ISBN', () => {
    expect(variantsFor(query, fullCaps)).toEqual([
      {
        id: 'book',
        params: {
          t: 'book',
          title: 'The Lighthouse Cartographer',
          author: 'Ada Quill',
          cat: '7020',
        },
        label: 'book title=The Lighthouse Cartographer author=Ada Quill',
      },
      {
        id: 'author_title',
        params: { t: 'search', q: 'Ada Quill The Lighthouse Cartographer', cat: '7020' },
        label: 'search q=Ada Quill The Lighthouse Cartographer',
      },
      {
        id: 'title',
        params: { t: 'search', q: 'The Lighthouse Cartographer', cat: '7000' },
        label: 'search q=The Lighthouse Cartographer',
      },
      {
        id: 'isbn',
        params: { t: 'search', q: '9780000000002', cat: '7000' },
        label: 'search q=9780000000002',
      },
    ]);
  });

  it('skips t=book without caps, or when it cannot search by title', () => {
    expect(variantsFor(query, null).map((v) => v.id)).toEqual(['author_title', 'title', 'isbn']);
    expect(
      variantsFor(query, { bookSearch: true, bookParams: ['q'] }).map((v) => v.id),
    ).not.toContain('book');
    expect(
      variantsFor(query, { bookSearch: false, bookParams: ['title'] }).map((v) => v.id),
    ).not.toContain('book');
  });

  it('leaves the author out of t=book when the indexer does not take it', () => {
    const [book] = variantsFor(query, { bookSearch: true, bookParams: ['title'] });
    expect(book).toMatchObject({ params: { t: 'book', title: 'The Lighthouse Cartographer' } });
    expect(book!.params.author).toBeUndefined();
    expect(book!.label).toBe('book title=The Lighthouse Cartographer');
  });

  it('works without author or ISBN', () => {
    const bare: BookQuery = { title: 'Anonymous Tales', authors: [], language: 'nl' };
    expect(variantsFor(bare, fullCaps).map((v) => v.id)).toEqual(['book', 'title']);
  });
});

describe('orderByHitRate', () => {
  const variants = variantsFor(query, fullCaps);

  it('keeps the default order without history', () => {
    expect(orderByHitRate(variants, new Map()).map((v) => v.id)).toEqual([
      'book',
      'author_title',
      'title',
      'isbn',
    ]);
  });

  it('moves variants that hit more often to the front', () => {
    const stats = new Map([
      ['book', { attempts: 6, hits: 0 }],
      ['title', { attempts: 4, hits: 4 }],
      ['isbn', { attempts: 2, hits: 1 }],
    ] as const);
    expect(orderByHitRate(variants, stats).map((v) => v.id)).toEqual([
      'title',
      'author_title',
      'isbn',
      'book',
    ]);
  });
});

describe('titleMatchJudge', () => {
  const item = (title: string) => ({
    guid: 'g',
    title,
    size: null,
    category: null,
    grabs: null,
    language: null,
    publishedAt: null,
  });

  it('accepts a release that names every title word', () => {
    expect(
      titleMatchJudge.acceptable(query, item('Ada.Quill-The.Lighthouse.Cartographer.EPUB')),
    ).toBe(true);
  });

  it('rejects one that misses a word', () => {
    expect(titleMatchJudge.acceptable(query, item('The Lighthouse Keeper'))).toBe(false);
  });

  it('rejects everything for a title without words', () => {
    expect(titleMatchJudge.acceptable({ ...query, title: '?' }, item('?'))).toBe(false);
  });

  it('ignores accents and case', () => {
    expect(normalise('Één Café')).toEqual(['een', 'cafe']);
  });
});
