import type { NewznabItem } from '../budget/gateway.js';
import { matchBook } from './match.js';
import type { BookQuery } from './planner.js';

export { normalise } from './match.js';

/** Decides whether a search result is good enough to stop searching. */
export interface ReleaseJudge {
  acceptable: (query: BookQuery, item: NewznabItem) => boolean;
}

/**
 * Minimal judge until release scoring (BRK-06): every word of the cleaned
 * title appears in the release name, it is not another book of the same
 * series (BRK-15), and the release says enough to tell it is this book:
 * the author is named, or the title is more than one telling word (BRK-16).
 */
export const titleMatchJudge: ReleaseJudge = {
  acceptable(query, item) {
    const m = matchBook(query, item.title);
    return m.titleMatch === 1 && !m.otherVolume && m.identified;
  },
};
