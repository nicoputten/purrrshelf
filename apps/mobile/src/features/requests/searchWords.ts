import type { Budget, IndexerBudget } from '@purrshelf/contract';

/** Words that tell a release name nothing on their own (en and nl). */
const FILLER = new Set([
  'a',
  'an',
  'and',
  'of',
  'the',
  'to',
  'in',
  'de',
  'het',
  'een',
  'en',
  'van',
]);

const words = (text: string) =>
  text
    .replace(/[:;,.!?()[\]#–—"“”]/g, ' ')
    .replace(/\s-\s/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** The title before a subtitle ("Atlas: The Story of Pa Salt" → "Atlas") and its subtitle. */
export function splitTitle(title: string): { main: string; subtitle: string } {
  const plain = title.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').trim();
  const m = /^(.*?)\s*(?:[:–—]|\s-)\s+(.*)$/.exec(plain);
  return m?.[1] && m[2]
    ? { main: m[1].trim(), subtitle: m[2].trim() }
    : { main: plain, subtitle: '' };
}

/**
 * Search words to try for a hard-to-find book (APP-18), best first: the
 * whole title, the title with the last telling words of the subtitle, the
 * author's surname with the title, and the title alone. No duplicates.
 */
export function suggestWords(title: string, authors: readonly string[]): string[] {
  const { main, subtitle } = splitTitle(title);
  const mainWords = words(main).join(' ');
  const telling = words(subtitle).filter((w) => !FILLER.has(w.toLowerCase()));
  const surname = words(authors[0] ?? '').at(-1);
  const candidates = [
    words(title).join(' '),
    telling.length > 0 ? `${mainWords} ${telling.slice(-2).join(' ')}` : '',
    surname ? `${surname} ${mainWords}` : '',
    mainWords,
  ];
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The words to start with: the first suggestion not tried yet, else the first. */
export function firstWords(suggestions: readonly string[], tried: readonly string[]): string {
  const done = new Set(tried.map((w) => w.toLowerCase()));
  return suggestions.find((s) => !done.has(s.toLowerCase())) ?? suggestions[0] ?? '';
}

/** Indexers that can search (limit above 0). */
export const searchableIndexers = (budget: Budget | undefined): IndexerBudget[] =>
  (budget?.indexers ?? []).filter((i) => i.searches.limit > 0);

/** The indexer picked at first: the one with the most searches left, then by priority. */
export function defaultIndexer(indexers: readonly IndexerBudget[]): IndexerBudget | null {
  return (
    [...indexers].sort((a, b) => b.searches.left - a.searches.left || a.priority - b.priority)[0] ??
    null
  );
}
