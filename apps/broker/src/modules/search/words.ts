/** Words of a title or release name: accents and case dropped, one-letter words left out. */
export function normalise(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/** Small words that say nothing about which book it is (en + nl). */
const FILLER = new Set([
  'the',
  'an',
  'and',
  'of',
  'in',
  'on',
  'to',
  'for',
  'de',
  'het',
  'een',
  'en',
  'van',
  'op',
  'te',
  'voor',
]);

export const isFiller = (word: string): boolean => FILLER.has(word.toLowerCase());

/** How many words of a normalised word list tell one book from another. */
export const tellingCount = (words: string[]): number => words.filter((w) => !isFiller(w)).length;

/** The telling words of a title as written ("Atlas: The Story of Pa Salt" → "Atlas Story Pa Salt"). */
export function tellingWords(title: string): string {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !isFiller(w))
    .join(' ');
}

/** A title needs this many telling words to tell one book from another on its own. */
export const MIN_TELLING_WORDS = 2;
