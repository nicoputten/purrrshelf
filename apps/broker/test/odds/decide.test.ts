import {
  LOW_ODDS_NEW_DAYS,
  LOW_ODDS_NOT_FOUND_DAYS,
  LOW_ODDS_RARE_READERS,
  LowOdds,
} from '@purrshelf/contract';
import { describe, expect, it } from 'vitest';
import { lowOdds, type OddsFacts } from '../../src/modules/odds/decide.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-09T15:30:00.000Z');
const ago = (days: number, ms = 0) => new Date(NOW.getTime() - days * DAY - ms);

/** An invented English book with an ISBN, out for years, read by many: no warning. */
function facts(over: Partial<OddsFacts> = {}): OddsFacts {
  return {
    workId: 'hardcover:301',
    language: 'en',
    isbns: ['9780000000026'],
    releaseDate: '2019-03-01',
    publishedYear: 2019,
    workLanguage: 'en',
    languages: ['en'],
    readers: 250,
    lastNotFoundAt: null,
    ...over,
  };
}

const none = { notFoundAt: null, releaseDate: null, englishEditionWorkId: null, readers: null };

describe('lowOdds (ADR 0041)', () => {
  it('has nothing to say about a well-known English book', () => {
    expect(lowOdds(facts(), NOW)).toBeNull();
  });

  it('uses the contract thresholds', () => {
    expect([LOW_ODDS_NOT_FOUND_DAYS, LOW_ODDS_NEW_DAYS, LOW_ODDS_RARE_READERS]).toEqual([
      30, 14, 10,
    ]);
  });

  describe('LOW_ODDS_NOT_FOUND', () => {
    it('warns with the date of a "not found" up to 30 days ago', () => {
      const at = ago(LOW_ODDS_NOT_FOUND_DAYS);
      const odds = lowOdds(facts({ lastNotFoundAt: at }), NOW);
      expect(odds).toEqual({ ...none, code: 'LOW_ODDS_NOT_FOUND', notFoundAt: at.toISOString() });
      expect(LowOdds.parse(odds)).toEqual(odds);
      expect(lowOdds(facts({ lastNotFoundAt: ago(2) }), NOW)?.code).toBe('LOW_ODDS_NOT_FOUND');
    });

    it('forgets a "not found" older than 30 days', () => {
      expect(lowOdds(facts({ lastNotFoundAt: ago(LOW_ODDS_NOT_FOUND_DAYS, 1) }), NOW)).toBeNull();
    });
  });

  describe('LOW_ODDS_NO_MATCH', () => {
    it('warns when the metadata has no ISBN', () => {
      expect(lowOdds(facts({ isbns: [] }), NOW)).toEqual({ ...none, code: 'LOW_ODDS_NO_MATCH' });
    });
  });

  describe('LOW_ODDS_NEW', () => {
    it('warns for a book published 14 days ago or less, with the date', () => {
      for (const releaseDate of ['2026-10-26', '2026-11-01', '2026-11-09']) {
        expect(lowOdds(facts({ releaseDate }), NOW)).toEqual({
          ...none,
          code: 'LOW_ODDS_NEW',
          releaseDate,
        });
      }
    });

    it('does not warn from day 15', () => {
      expect(lowOdds(facts({ releaseDate: '2026-10-25' }), NOW)).toBeNull();
    });

    it('warns for a book that is not out yet', () => {
      expect(lowOdds(facts({ releaseDate: '2027-02-01', publishedYear: 2027 }), NOW)).toEqual({
        ...none,
        code: 'LOW_ODDS_NEW',
        releaseDate: '2027-02-01',
      });
    });

    it('with only a year, warns only for a year after this one', () => {
      const yearOnly = (publishedYear: number | null) =>
        lowOdds(facts({ releaseDate: null, publishedYear }), NOW);
      expect(yearOnly(2027)).toEqual({ ...none, code: 'LOW_ODDS_NEW' });
      expect(yearOnly(2026)).toBeNull();
      expect(yearOnly(1860)).toBeNull();
      expect(yearOnly(null)).toBeNull();
    });

    it('trusts the full date over the year', () => {
      expect(lowOdds(facts({ releaseDate: '2020-01-01', publishedYear: 2027 }), NOW)).toBeNull();
    });
  });

  describe('LOW_ODDS_LANGUAGE', () => {
    it('warns for a Dutch request and names the English edition when there is one', () => {
      expect(
        lowOdds(facts({ language: 'nl', workLanguage: 'nl', languages: ['nl', 'en'] }), NOW),
      ).toEqual({ ...none, code: 'LOW_ODDS_LANGUAGE', englishEditionWorkId: 'hardcover:301' });
      expect(
        lowOdds(facts({ language: 'nl', workLanguage: 'en', languages: [] }), NOW)
          ?.englishEditionWorkId,
      ).toBe('hardcover:301');
    });

    it('hides the link when no English edition is known', () => {
      expect(
        lowOdds(facts({ language: 'nl', workLanguage: 'nl', languages: ['nl'] }), NOW),
      ).toEqual({ ...none, code: 'LOW_ODDS_LANGUAGE' });
      expect(
        lowOdds(facts({ language: 'nl', workLanguage: null, languages: [] }), NOW)
          ?.englishEditionWorkId,
      ).toBeNull();
    });
  });

  describe('LOW_ODDS_RARE', () => {
    it('warns below 10 Hardcover readers, with the count', () => {
      expect(lowOdds(facts({ readers: LOW_ODDS_RARE_READERS - 1 }), NOW)).toEqual({
        ...none,
        code: 'LOW_ODDS_RARE',
        readers: 9,
      });
      expect(lowOdds(facts({ readers: 0 }), NOW)?.readers).toBe(0);
    });

    it('does not warn at 10 readers or when Hardcover does not know the book', () => {
      expect(lowOdds(facts({ readers: LOW_ODDS_RARE_READERS }), NOW)).toBeNull();
      expect(lowOdds(facts({ readers: null }), NOW)).toBeNull();
    });
  });

  it('sends only the strongest reason when several apply', () => {
    const all = facts({
      lastNotFoundAt: ago(1),
      isbns: [],
      releaseDate: '2026-11-05',
      language: 'nl',
      workLanguage: 'nl',
      languages: ['nl'],
      readers: 2,
    });
    const order: LowOdds['code'][] = [];
    let f = all;
    for (const next of [
      { lastNotFoundAt: null },
      { isbns: ['9780000000026'] },
      { releaseDate: '2019-03-01' },
      { language: 'en' as const },
      { readers: 250 },
    ]) {
      const odds = lowOdds(f, NOW);
      order.push(odds!.code);
      f = { ...f, ...next };
    }
    expect(order).toEqual([
      'LOW_ODDS_NOT_FOUND',
      'LOW_ODDS_NO_MATCH',
      'LOW_ODDS_NEW',
      'LOW_ODDS_LANGUAGE',
      'LOW_ODDS_RARE',
    ]);
    expect(lowOdds(f, NOW)).toBeNull();
  });
});
