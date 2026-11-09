import { describe, expect, it } from 'vitest';
import {
  activityOf,
  authorSeeds,
  basisOf,
  fingerprint,
  inLanguages,
  isNew,
  readerLanguages,
  seriesSeeds,
} from '../../src/modules/recommend/seeds.js';
import type { ReaderBook } from '../../src/modules/recommend/types.js';
import type { ReadStatus } from '../../src/modules/library/types.js';

let nextId = 1;
function book(
  over: Partial<ReaderBook> & { status?: ReadStatus; readAt?: string } = {},
): ReaderBook {
  const { status, readAt, ...rest } = over;
  const id = nextId++;
  return {
    itemId: `item-${id}`,
    workId: `hardcover:${id}`,
    calibreBookId: id,
    title: `Book ${id}`,
    authors: ['Ada Quillfeather'],
    series: null,
    isbns: [],
    languages: ['en'],
    tags: [],
    ownedAt: new Date('2026-01-01T00:00:00Z'),
    reading:
      status === undefined
        ? null
        : {
            status,
            progressPercent: null,
            spentReadingMinutes: null,
            remainingMinutes: null,
            lastModified: readAt ? new Date(readAt) : null,
          },
    ...rest,
  };
}

describe('basisOf and activityOf', () => {
  it('counts finished and in-progress books with Kobo data, every owned book without', () => {
    expect(basisOf(book({ status: 'finished' }), true)).toBe('finished');
    expect(basisOf(book({ status: 'reading' }), true)).toBe('reading');
    expect(basisOf(book({ status: 'unread' }), true)).toBeNull();
    expect(basisOf(book(), true)).toBeNull();
    expect(basisOf(book({ status: 'unread' }), false)).toBe('owned');
  });

  it('takes the later of reading and owning', () => {
    expect(activityOf(book({ status: 'finished', readAt: '2026-02-01T00:00:00Z' }))).toBe(
      Date.parse('2026-02-01T00:00:00Z'),
    );
    expect(activityOf(book())).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });
});

describe('readerLanguages', () => {
  it('keeps languages of at least a fifth of finished books, most read first', () => {
    const books = [
      ...Array.from({ length: 6 }, () => book({ status: 'finished', languages: ['nl'] })),
      ...Array.from({ length: 2 }, () => book({ status: 'finished', languages: ['en'] })),
      book({ status: 'finished', languages: ['de'] }),
      book({ status: 'finished', languages: [] }),
      book({ status: 'reading', languages: ['fr'] }),
    ];
    expect(readerLanguages(books, true, 'en')).toEqual(['nl', 'en']);
  });

  it('breaks a tie alphabetically and uses owned books without Kobo data', () => {
    const books = [book({ languages: ['nl'] }), book({ languages: ['en'] })];
    expect(readerLanguages(books, false, 'nl')).toEqual(['en', 'nl']);
  });

  it('falls back to the app language when no language is known', () => {
    expect(readerLanguages([book({ status: 'finished', languages: [] })], true, 'nl')).toEqual([
      'nl',
    ]);
  });

  it('lets books of unknown language through', () => {
    expect(inLanguages({ language: null }, ['nl'])).toBe(true);
    expect(inLanguages({ language: 'nl' }, ['nl'])).toBe(true);
    expect(inLanguages({ language: 'en' }, ['nl'])).toBe(false);
  });
});

describe('seriesSeeds', () => {
  it('takes the furthest counted book per series, most recently active series first', () => {
    const one = book({
      status: 'finished',
      series: { name: 'Harbour Tales', index: 1 },
      readAt: '2026-03-01T00:00:00Z',
    });
    const two = book({
      status: 'reading',
      series: { name: 'harbour tales ', index: 2 },
      readAt: '2026-02-01T00:00:00Z',
    });
    const other = book({
      status: 'finished',
      series: { name: 'Quiet Rivers', index: 4 },
      readAt: '2026-02-15T00:00:00Z',
    });
    const unread = book({ status: 'unread', series: { name: 'Quiet Rivers', index: 5 } });
    const loose = book({ status: 'finished' });
    const seeds = seriesSeeds([one, two, other, unread, loose], true);
    expect(seeds.map((s) => [s.name, s.position, s.basis, s.book.itemId])).toEqual([
      ['harbour tales ', 2, 'reading', two.itemId],
      ['Quiet Rivers', 4, 'finished', other.itemId],
    ]);
    // The series keeps the most recent activity of any of its books.
    expect(seeds[0]!.activity).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });

  it('keeps the activity of a later book that is not the furthest', () => {
    const far = book({
      status: 'finished',
      series: { name: 'Harbour Tales', index: 3 },
      readAt: '2026-01-05T00:00:00Z',
    });
    const near = book({
      status: 'finished',
      series: { name: 'Harbour Tales', index: 1 },
      readAt: '2026-04-01T00:00:00Z',
    });
    const [seed] = seriesSeeds([far, near], true);
    expect(seed).toMatchObject({ position: 3, activity: Date.parse('2026-04-01T00:00:00Z') });
  });
});

describe('authorSeeds', () => {
  it('counts finished books per author, most first, and names the only one', () => {
    const books = [
      book({ status: 'finished', authors: ['Bram Inkwell'], title: 'Only One' }),
      book({ status: 'finished', authors: ['Ada Quillfeather', 'Cleo Driftwood'] }),
      book({ status: 'finished', authors: ['Quillfeather, Ada'] }),
      book({ status: 'reading', authors: ['Edda Marlow'] }),
      book({ status: 'finished', authors: ['...'] }),
    ];
    expect(authorSeeds(books, true).map((s) => [s.author, s.count, s.title])).toEqual([
      ['Ada Quillfeather', 2, null],
      ['Bram Inkwell', 1, 'Only One'],
      ['Cleo Driftwood', 1, expect.any(String)],
    ]);
  });

  it('needs two owned books by an author without Kobo data', () => {
    const books = [
      book({ authors: ['Bram Inkwell'] }),
      book({ authors: ['Ada Quillfeather'] }),
      book({ authors: ['Ada Quillfeather'] }),
    ];
    expect(authorSeeds(books, false).map((s) => [s.author, s.count, s.basis])).toEqual([
      ['Ada Quillfeather', 2, 'owned'],
    ]);
  });
});

describe('isNew and fingerprint', () => {
  it('calls this year and last year new', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    expect(isNew(2026, now)).toBe(true);
    expect(isNew(2025, now)).toBe(true);
    expect(isNew(2024, now)).toBe(false);
    expect(isNew(null, now)).toBe(false);
  });

  it('changes when a book is finished, not when an unread book is added', () => {
    const a = book({ status: 'finished' });
    const b = book({ status: 'unread' });
    const base = fingerprint([a, b], true, ['en']);
    expect(fingerprint([b, a], true, ['en'])).toBe(base);
    expect(fingerprint([a, b, book({ status: 'unread' })], true, ['en'])).toBe(base);
    expect(
      fingerprint([a, { ...b, reading: { ...b.reading!, status: 'finished' } }], true, ['en']),
    ).not.toBe(base);
    expect(fingerprint([a, b], true, ['nl'])).not.toBe(base);
    expect(fingerprint([a, b], false, ['en'])).not.toBe(base);
  });
});
