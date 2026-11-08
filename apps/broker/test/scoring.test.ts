import { describe, expect, it } from 'vitest';
import {
  ACCEPT_THRESHOLD,
  detectFormat,
  detectLanguage,
  rankReleases,
  scoreRelease,
  type ReleaseCandidate,
} from '../src/modules/releases/scoring.js';
import type { BookQuery } from '../src/modules/search/planner.js';

const NOW = new Date('2026-01-01T12:00:00.000Z');
const MB = 1024 * 1024;
const query: BookQuery = {
  title: 'The Lighthouse Cartographer',
  authors: ['Ada Quill'],
  language: 'en',
};

function release(overrides: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
  return {
    guid: 'g1',
    title: 'Ada Quill - The Lighthouse Cartographer (2021) EPUB',
    size: 2 * MB,
    language: 'English',
    grabs: 10,
    publishedAt: new Date('2025-06-01T00:00:00Z'),
    ...overrides,
  };
}

const score = (r: ReleaseCandidate, failed: string[] = []) =>
  scoreRelease(query, r, { now: NOW, failedGuids: new Set(failed) });

describe('detectFormat', () => {
  it.each([
    ['Book.EPUB', 'epub'],
    ['Book (kepub)', 'kepub'],
    ['Book.azw3', 'azw3'],
    ['Book MOBI', 'mobi'],
    ['Book.pdf', 'pdf'],
    ['Comic.cbz', 'cbz'],
    ['Comic cbr', 'cbr'],
    ['Book retail', null],
  ])('%s → %s', (title, format) => {
    expect(detectFormat(title)).toBe(format);
  });
});

describe('detectLanguage', () => {
  it.each([
    [{ title: 'x', language: 'English' }, 'en'],
    [{ title: 'x', language: 'Dutch' }, 'nl'],
    [{ title: 'x', language: 'Nederlands' }, 'nl'],
    [{ title: 'x', language: 'German' }, 'other'],
    [{ title: 'Boek NL epub', language: null }, 'nl'],
    [{ title: 'Book [ENG] epub', language: null }, 'en'],
    [{ title: 'Buch German epub', language: null }, 'other'],
    [{ title: 'Book epub', language: null }, null],
  ])('%j → %s', (input, lang) => {
    expect(detectLanguage(input.title, input.language)).toBe(lang);
  });
});

describe('scoreRelease', () => {
  it('scores a clean EPUB match high and above the threshold', () => {
    const s = score(release());
    expect(s.rejected).toEqual([]);
    expect(s.score).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
    expect(s.signals).toMatchObject({
      format: 'epub',
      language: 'en',
      titleMatch: 1,
      authorMatch: true,
      sizeOk: true,
    });
  });

  it('prefers EPUB over AZW3 over MOBI', () => {
    const epub = score(release()).score;
    const azw3 = score(release({ title: 'Ada Quill - The Lighthouse Cartographer azw3' })).score;
    const mobi = score(release({ title: 'Ada Quill - The Lighthouse Cartographer mobi' })).score;
    expect(epub).toBeGreaterThan(azw3);
    expect(azw3).toBeGreaterThan(mobi);
  });

  it('gives an unknown format a small penalty', () => {
    const unknown = score(release({ title: 'Ada Quill - The Lighthouse Cartographer' }));
    expect(unknown.rejected).toEqual([]);
    expect(unknown.score).toBeLessThan(score(release()).score);
  });

  it.each(['pdf', 'cbz', 'cbr'])('rejects %s', (fmt) => {
    expect(
      score(release({ title: `Ada Quill - The Lighthouse Cartographer ${fmt}` })).rejected,
    ).toContain('format_excluded');
  });

  it('rejects audiobooks', () => {
    expect(
      score(release({ title: 'Ada Quill - The Lighthouse Cartographer Audiobook M4B' })).rejected,
    ).toContain('audiobook');
  });

  it('penalises an unknown language a little and another language a lot', () => {
    const base = score(release()).score;
    const unknown = score(release({ language: null })).score;
    const other = score(release({ language: 'Dutch' }));
    expect(unknown).toBeLessThan(base);
    expect(base - unknown).toBeLessThan(10);
    expect(other.rejected).toContain('language_mismatch');
  });

  it('rejects a title that does not match', () => {
    const s = score(release({ title: 'Ada Quill - The Lighthouse Keeper EPUB' }));
    expect(s.signals.titleMatch).toBeLessThan(1);
    expect(s.rejected).toContain('title_mismatch');
  });

  it('accepts a near-complete title match with a small penalty', () => {
    const long = { ...query, title: 'The Lighthouse Cartographer of Saltmarsh Bay' };
    const ctx = { now: NOW, failedGuids: new Set<string>() };
    const near = scoreRelease(
      long,
      release({ title: 'Ada Quill - The Lighthouse Cartographer Saltmarsh Bay EPUB' }),
      ctx,
    );
    const full = scoreRelease(
      long,
      release({ title: 'Ada Quill - The Lighthouse Cartographer of Saltmarsh Bay EPUB' }),
      ctx,
    );
    expect(near.signals.titleMatch).toBeCloseTo(5 / 6);
    expect(near.rejected).toEqual([]);
    expect(full.score - near.score).toBe(5);
  });

  it('penalises a missing author but still accepts the title', () => {
    const s = score(release({ title: 'The Lighthouse Cartographer EPUB' }));
    expect(s.signals.authorMatch).toBe(false);
    expect(s.rejected).toEqual([]);
    expect(s.score).toBeLessThan(score(release()).score);
  });

  it('accepts any author when the work has none', () => {
    const s = scoreRelease({ ...query, authors: [] }, release(), {
      now: NOW,
      failedGuids: new Set(),
    });
    expect(s.signals.authorMatch).toBe(true);
  });

  it.each([
    [0.1 * MB, 'size_out_of_range'],
    [60 * MB, 'size_out_of_range'],
  ])('penalises size %d', (size, reason) => {
    const s = score(release({ size }));
    expect(s.signals.sizeOk).toBe(false);
    expect(s.score).toBeLessThan(score(release()).score);
    expect(s.rejected).not.toContain(reason);
  });

  it.each([10 * 1024, 300 * MB])('rejects absurd size %d', (size) => {
    expect(score(release({ size })).rejected).toContain('size_out_of_range');
  });

  it('treats an unknown size as fine', () => {
    expect(score(release({ size: null })).signals.sizeOk).toBe(true);
  });

  it('gives newer and more grabbed releases a small bonus', () => {
    const plain = score(release({ grabs: 0, publishedAt: new Date('2010-01-01T00:00:00Z') })).score;
    const popular = score(
      release({ grabs: 500, publishedAt: new Date('2010-01-01T00:00:00Z') }),
    ).score;
    const fresh = score(release({ grabs: 0, publishedAt: new Date('2025-12-01T00:00:00Z') })).score;
    expect(popular).toBeGreaterThan(plain);
    expect(fresh).toBeGreaterThan(plain);
    expect(popular - plain).toBeLessThanOrEqual(5);
    const fewYears = score(
      release({ grabs: 0, publishedAt: new Date('2023-01-01T00:00:00Z') }),
    ).score;
    expect(fewYears - plain).toBe(1);
    expect(fresh - plain).toBe(2);
    expect(score(release({ grabs: null, publishedAt: null })).rejected).toEqual([]);
  });

  it('rejects a release that failed before', () => {
    expect(score(release(), ['g1']).rejected).toContain('failed_before');
  });

  it('keeps the score between 0 and 100', () => {
    const awful = score(
      release({ title: 'Something PDF Audiobook', size: 1, language: 'German', grabs: 0 }),
      ['g1'],
    );
    expect(awful.score).toBe(0);
    expect(score(release({ grabs: 100000 })).score).toBeLessThanOrEqual(100);
  });
});

describe('rankReleases', () => {
  it('orders by score, rejected last, and picks the best above the threshold', () => {
    const list = [
      release({ guid: 'pdf', title: 'Ada Quill - The Lighthouse Cartographer PDF' }),
      release({ guid: 'mobi', title: 'Ada Quill - The Lighthouse Cartographer mobi' }),
      release({ guid: 'epub' }),
    ];
    const ranked = rankReleases(query, list, { now: NOW, failedGuids: new Set() });
    expect(ranked.ranked.map((r) => r.release.guid)).toEqual(['epub', 'mobi', 'pdf']);
    expect(ranked.best?.release.guid).toBe('epub');
  });

  it('picks nothing when no release clears the threshold', () => {
    const list = [
      release({
        guid: 'x',
        title: 'The Lighthouse Cartographer',
        language: null,
        size: 0.15 * MB,
        grabs: 0,
        publishedAt: null,
      }),
    ];
    const ranked = rankReleases(query, list, { now: NOW, failedGuids: new Set() });
    expect(ranked.ranked[0]!.score).toBeLessThan(ACCEPT_THRESHOLD);
    expect(ranked.best).toBeNull();
  });

  it('handles an empty list', () => {
    expect(rankReleases(query, [], { now: NOW, failedGuids: new Set() })).toEqual({
      ranked: [],
      best: null,
    });
  });

  it('rejects everything for a title without words', () => {
    const s = scoreRelease({ ...query, title: '?' }, release(), {
      now: NOW,
      failedGuids: new Set(),
    });
    expect(s.signals.titleMatch).toBe(0);
    expect(s.rejected).toContain('title_mismatch');
  });

  it('breaks ties by input order', () => {
    const ranked = rankReleases(query, [release({ guid: 'a' }), release({ guid: 'b' })], {
      now: NOW,
      failedGuids: new Set(),
    });
    expect(ranked.ranked.map((r) => r.release.guid)).toEqual(['a', 'b']);
  });
});
