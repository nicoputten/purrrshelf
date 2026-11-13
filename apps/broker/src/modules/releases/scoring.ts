import { normalise } from '../search/judge.js';
import { cleanTitle, type BookQuery } from '../search/planner.js';
import { isOtherVolume } from '../search/volume.js';

/** What scoring needs to know about one search result. */
export interface ReleaseCandidate {
  guid: string;
  title: string;
  /** Bytes. */
  size: number | null;
  /** The indexer's language attribute, if any. */
  language: string | null;
  grabs: number | null;
  publishedAt: Date | null;
}

/** Stable reasons a release is left out; the app translates them. */
export type RejectReason =
  | 'format_excluded'
  | 'audiobook'
  | 'language_mismatch'
  | 'title_mismatch'
  | 'size_out_of_range'
  | 'failed_before';

export type Format = 'epub' | 'kepub' | 'azw3' | 'mobi' | 'pdf' | 'cbz' | 'cbr';
export type Language = 'en' | 'nl' | 'other';

export interface ReleaseScore {
  /** 0–100; 0 when rejected. */
  score: number;
  rejected: RejectReason[];
  signals: {
    format: Format | null;
    language: Language | null;
    /** Share of the title's words found in the release name. */
    titleMatch: number;
    authorMatch: boolean;
    sizeOk: boolean;
  };
}

export interface ScoringContext {
  now: Date;
  /** Releases that failed before for this request. */
  failedGuids: ReadonlySet<string>;
}

/** A release at or above this score is grabbed without asking (ADR 0006). */
export const ACCEPT_THRESHOLD = 60;

const FORMAT_POINTS: Record<Format, number | null> = {
  epub: 30,
  kepub: 28,
  azw3: 20,
  mobi: 12,
  pdf: null,
  cbz: null,
  cbr: null,
};
const UNKNOWN_FORMAT_POINTS = 5;
const MIN_TITLE_MATCH = 0.8;
const MB = 1024 * 1024;

export function detectFormat(title: string): Format | null {
  const m = title.toLowerCase().match(/\b(epub|kepub|azw3|mobi|pdf|cbz|cbr)\b/);
  return (m?.[1] as Format | undefined) ?? null;
}

const LANGUAGE_NAMES: Record<string, Language> = {
  english: 'en',
  en: 'en',
  eng: 'en',
  dutch: 'nl',
  nederlands: 'nl',
  flemish: 'nl',
  nl: 'nl',
  nld: 'nl',
  dut: 'nl',
};

export function detectLanguage(title: string, attr: string | null): Language | null {
  if (attr) return LANGUAGE_NAMES[attr.trim().toLowerCase()] ?? 'other';
  // Short codes only in capitals: "en" is also a Dutch word.
  if (/\bNL\b|\b(dutch|nederlands)\b/i.test(title)) return 'nl';
  if (/\bEN\b|\b(eng|english)\b/i.test(title)) return 'en';
  if (/\b(german|deutsch|french|fran[cç]ais|spanish|espa[nñ]ol|italian|italiano)\b/i.test(title)) {
    return 'other';
  }
  return null;
}

const AUDIO = /\b(audio ?books?|mp3|m4b|flac|aac)\b/i;

function sizePoints(size: number | null): { points: number; ok: boolean; reject: boolean } {
  if (size === null) return { points: 0, ok: true, reject: false };
  const mb = size / MB;
  if (mb < 0.05 || mb > 200) return { points: 0, ok: false, reject: true };
  if (mb < 0.2 || mb > 50) return { points: -15, ok: false, reject: false };
  return { points: 0, ok: true, reject: false };
}

function freshnessPoints(release: ReleaseCandidate, now: Date): number {
  const grabs = Math.min(3, Math.log10((release.grabs ?? 0) + 1));
  if (!release.publishedAt) return grabs;
  const days = (now.getTime() - release.publishedAt.getTime()) / 86_400_000;
  return grabs + (days <= 365 ? 2 : days <= 5 * 365 ? 1 : 0);
}

/** Scores one release: format, language, title/author match, size, age and grabs, failures. */
export function scoreRelease(
  query: BookQuery,
  release: ReleaseCandidate,
  ctx: ScoringContext,
): ReleaseScore {
  const rejected: RejectReason[] = [];
  let points = 50;

  const format = detectFormat(release.title);
  const formatPoints = format ? FORMAT_POINTS[format] : UNKNOWN_FORMAT_POINTS;
  if (formatPoints === null) rejected.push('format_excluded');
  else points += formatPoints;

  if (AUDIO.test(release.title)) rejected.push('audiobook');

  const language = detectLanguage(release.title, release.language);
  if (language === null) points += 4;
  else if (language === query.language) points += 10;
  else rejected.push('language_mismatch');

  const have = new Set(normalise(release.title));
  const want = normalise(cleanTitle(query.title));
  const titleMatch = want.length ? want.filter((w) => have.has(w)).length / want.length : 0;
  // Another book of the same series is "another book" too (BRK-15).
  if (titleMatch < MIN_TITLE_MATCH || isOtherVolume(query, release.title)) {
    rejected.push('title_mismatch');
  } else if (titleMatch < 1) points -= 5;

  const surnames = query.authors.flatMap((a) => normalise(a).slice(-1));
  const authorMatch = surnames.length === 0 || surnames.some((s) => have.has(s));
  points += authorMatch ? 5 : -10;

  const size = sizePoints(release.size);
  if (size.reject) rejected.push('size_out_of_range');
  points += size.points;

  points += freshnessPoints(release, ctx.now);

  if (ctx.failedGuids.has(release.guid)) rejected.push('failed_before');

  const score = rejected.length ? 0 : Math.max(0, Math.min(100, Math.round(points * 10) / 10));
  return {
    score,
    rejected,
    signals: { format, language, titleMatch, authorMatch, sizeOk: size.ok },
  };
}

export interface RankedRelease<R extends ReleaseCandidate> extends ReleaseScore {
  release: R;
}

/** Scores and sorts a result list; `best` is the top release if it clears the threshold. */
export function rankReleases<R extends ReleaseCandidate>(
  query: BookQuery,
  releases: R[],
  ctx: ScoringContext,
): { ranked: RankedRelease<R>[]; best: RankedRelease<R> | null } {
  const ranked = releases
    .map((release, i) => ({ ...scoreRelease(query, release, ctx), release, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ i: _i, ...r }) => r);
  const top = ranked[0];
  return { ranked, best: top && top.score >= ACCEPT_THRESHOLD ? top : null };
}
