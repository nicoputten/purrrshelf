import type { NewznabItem } from '../budget/gateway.js';
import { cleanTitle, type BookQuery } from './planner.js';

/** Decides whether a search result is good enough to stop searching. */
export interface ReleaseJudge {
  acceptable: (query: BookQuery, item: NewznabItem) => boolean;
}

export function normalise(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/**
 * Minimal judge until release scoring (BRK-06): every word of the cleaned
 * title appears in the release name.
 */
export const titleMatchJudge: ReleaseJudge = {
  acceptable(query, item) {
    const want = normalise(cleanTitle(query.title));
    const have = new Set(normalise(item.title));
    return want.length > 0 && want.every((w) => have.has(w));
  },
};
