/** Helpers to compare records from different providers. */

/** Accepts ISBN-10 or ISBN-13 with any punctuation; returns the ISBN-13 or `null`. */
export function toIsbn13(raw: string): string | null {
  const s = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) return isbn13CheckOk(s) ? s : null;
  if (/^\d{9}[\dX]$/.test(s)) {
    if (!isbn10CheckOk(s)) return null;
    const core = `978${s.slice(0, 9)}`;
    return core + isbn13CheckDigit(core);
  }
  return null;
}

function isbn10CheckOk(s: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = s.charAt(i);
    sum += (c === 'X' ? 10 : Number(c)) * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn13CheckDigit(core12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isbn13CheckOk(s: string): boolean {
  return isbn13CheckDigit(s.slice(0, 12)) === s[12];
}

/** Unique ISBN-13s, in first-seen order, capped so one hit doesn't carry hundreds. */
export function normaliseIsbns(raw: readonly string[], max = 40): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const isbn = toIsbn13(r);
    if (isbn) out.add(isbn);
    if (out.size >= max) break;
  }
  return [...out];
}

function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const LEADING_ARTICLES = /^(the|a|an|de|het|een|der|die|das|le|la|les|el)\s+/;

/** Title without subtitle, accents, punctuation or a leading article. */
export function titleKey(title: string): string {
  const main = title.split(/[:(]|\s[-–—]\s/)[0] ?? title;
  return fold(main).replace(LEADING_ARTICLES, '');
}

/** An author's surname, which survives "J.R.R. Tolkien" vs "Tolkien, J. R. R.". */
export function authorKey(author: string): string {
  const surname = author.includes(',') ? (author.split(',')[0] ?? '') : author;
  const tokens = fold(surname).split(' ').filter(Boolean);
  if (author.includes(',')) return tokens.join(' ');
  return tokens.at(-1) ?? '';
}

/** Key for de-duplicating by normalised title + first author. */
export function workKey(title: string, authors: readonly string[]): string {
  return `${titleKey(title)}|${authors[0] ? authorKey(authors[0]) : ''}`;
}

const ISO_639_2: Record<string, string> = {
  eng: 'en',
  dut: 'nl',
  nld: 'nl',
  ger: 'de',
  deu: 'de',
  fre: 'fr',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  pol: 'pl',
  rus: 'ru',
  jpn: 'ja',
  chi: 'zh',
  zho: 'zh',
  fry: 'fy',
};

/** Two-letter language code from a 2- or 3-letter code (`eng`, `en`, `en-GB`). */
export function languageCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (/^[a-z]{2}$/.test(code)) return code;
  if (/^[a-z]{3}$/.test(code)) return ISO_639_2[code] ?? code;
  return null;
}

/** Plain text from provider HTML (Google Books descriptions). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** First four-digit year in a date string. */
export function yearOf(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const m = raw?.match(/\b(\d{4})\b/);
  return m ? Number(m[1]) : null;
}

/** A full calendar date as YYYY-MM-DD (time part dropped), or null for anything less or invalid. */
export function fullDate(raw: string | null | undefined): string | null {
  const m = raw?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

export function blankToNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}
