import { cleanTitle, type BookQuery } from './planner.js';

/** Which book(s) of a series a release name says it holds. */
export type Volume =
  | { kind: 'none' }
  | { kind: 'single'; position: number }
  | { kind: 'range'; from: number; to: number };

const NOT_WORD = '[^\\p{L}\\p{N}]';
const KEYWORD = '(?:books?|bk|vol(?:ume)?|tome|deel|boek|band)';
const DIGITS = '(\\d{1,3}(?:\\.\\d{1,2})?)';
const RANGE = `(?:\\s*(?:-|–|to|tot|t/m)\\s*(\\d{1,3}))?`;
const END = '(?![\\p{L}\\p{N}])';
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
const WORD_NUMBER = `(${Object.keys(NUMBER_WORDS).join('|')})`;
const LEADING_ARTICLE = /^(?:the|a|an|de|het|een)$/;

/** Lower case, accents dropped; punctuation kept so numbers stay apart. */
function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(s: string): string[] {
  return fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** A series name's words without a leading article ("The Series" = "Series"). */
export function seriesWords(name: string): string[] {
  const ws = words(name);
  while (ws.length > 1 && LEADING_ARTICLE.test(ws[0] as string)) ws.shift();
  return ws;
}

/** A phrase as a regex that allows any punctuation between its words. */
function phrase(ws: string[]): string {
  return `(?<![\\p{L}\\p{N}])${ws.join(`${NOT_WORD}+`)}(?![\\p{L}\\p{N}])`;
}

function toVolume(from: string, to: string | undefined): Volume {
  const a = Number(NUMBER_WORDS[from] ?? from);
  const b = to === undefined ? NaN : Number(to);
  return b > a ? { kind: 'range', from: a, to: b } : { kind: 'single', position: a };
}

/**
 * Reads a volume number from a release name: a number right after the series
 * name ("Series 05", "Series #5", "Series, Book 5", "Series 1-3"), or a
 * "Book 5" / "#5" anywhere outside the book's own title.
 */
export function detectVolume(releaseTitle: string, seriesName: string, title: string): Volume {
  const name = fold(releaseTitle);
  const series = seriesWords(seriesName);

  if (series.length > 0) {
    const after = new RegExp(
      `${phrase(series)}${NOT_WORD}*(?:${KEYWORD}${NOT_WORD}*)?${DIGITS}${RANGE}${END}`,
      'u',
    ).exec(name);
    if (after) return toVolume(after[1] as string, after[2]);
  }

  // The book's own title may hold a number ("Part 2", "1984"): leave it out.
  const own = words(cleanTitle(title));
  const rest = own.length > 0 ? name.replace(new RegExp(phrase(own), 'gu'), ' ') : name;
  const keyed = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${KEYWORD}${NOT_WORD}*|#\\s*)(?:${DIGITS}|${WORD_NUMBER})${RANGE}${END}`,
    'u',
  ).exec(rest);
  if (keyed) return toVolume((keyed[1] ?? keyed[2]) as string, keyed[3]);
  return { kind: 'none' };
}

/**
 * True when a release names a different book of the query's series than the
 * one the user picked, or a bundle of several. Without a known series
 * position nothing is ruled out.
 */
export function isOtherVolume(query: BookQuery, releaseTitle: string): boolean {
  const want = query.series?.position;
  if (!query.series || want === null || want === undefined) return false;
  const volume = detectVolume(releaseTitle, query.series.name, query.title);
  if (volume.kind === 'none') return false;
  if (volume.kind === 'range') return true;
  return volume.position !== want;
}
