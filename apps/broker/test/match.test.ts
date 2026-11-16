import { describe, expect, it } from 'vitest';
import { matchBook } from '../src/modules/search/match.js';
import type { BookQuery } from '../src/modules/search/planner.js';

// Invented book: a one-word title with a subtitle, two authors, book 8 of a series.
const lamp: BookQuery = {
  title: 'Lamp: The Story of the Keeper',
  authors: ['Ada Quill', 'Ben Marsh'],
  language: 'en',
  series: { name: 'Seven Lanterns', position: 8 },
};

describe('matchBook', () => {
  it('names the book when the release names an author', () => {
    const m = matchBook(lamp, 'Ada Quill - Lamp (2023) EPUB');
    expect(m).toEqual({ titleMatch: 1, authorMatch: true, otherVolume: false, identified: true });
  });

  it('takes the second author too', () => {
    expect(matchBook(lamp, 'Marsh, B - Lamp epub').identified).toBe(true);
  });

  it('does not name the book from one title word alone (BRK-16)', () => {
    const m = matchBook(lamp, 'Lamp of Ashes - A Novel (epub)');
    expect(m.titleMatch).toBe(1);
    expect(m.authorMatch).toBe(false);
    expect(m.identified).toBe(false);
  });

  it('names the book without an author when the subtitle is there too', () => {
    expect(matchBook(lamp, 'Lamp - The Story of the Keeper (epub)').identified).toBe(true);
  });

  it('does not count filler words of a subtitle as telling', () => {
    const q: BookQuery = { ...lamp, title: 'Lamp: Of The' };
    expect(matchBook(q, 'Lamp Of The epub').identified).toBe(false);
  });

  it('names a title of two telling words without an author, as before', () => {
    const q: BookQuery = {
      title: 'The Lighthouse Cartographer',
      authors: ['Ada Quill'],
      language: 'en',
    };
    expect(matchBook(q, 'The Lighthouse Cartographer EPUB').identified).toBe(true);
  });

  it('names any release of a work without an author', () => {
    const q: BookQuery = { title: 'Lamp', authors: [], language: 'en' };
    expect(matchBook(q, 'Lamp epub')).toMatchObject({ authorMatch: true, identified: true });
  });

  it('flags another volume of the series', () => {
    expect(matchBook(lamp, 'Ada Quill - [Seven Lanterns 03] - Lamp Shade').otherVolume).toBe(true);
  });

  it('scores an empty title as no match', () => {
    expect(matchBook({ ...lamp, title: '?' }, 'anything').titleMatch).toBe(0);
  });
});
