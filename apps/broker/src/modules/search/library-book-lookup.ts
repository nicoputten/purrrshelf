import type { LibraryAdapter, LibraryBook } from '../library/types.js';
import { cleanTitle, type BookQuery } from './planner.js';
import type { LibraryLookup } from './service.js';
import { isOtherVolume, seriesWords } from './volume.js';

/** Title matches are substring matches: look past a few other volumes of a series. */
const TITLE_CANDIDATES = 10;

/**
 * A library book that is another volume of the query's series (BRK-15): its
 * title names another volume ("Fifth Title: Series Book 5"), or Calibre files
 * it under the same series at another position.
 */
function isOtherBook(query: BookQuery, book: LibraryBook): boolean {
  if (isOtherVolume(query, book.title)) return true;
  const want = query.series;
  if (!want || want.position === null || !book.series) return false;
  const same = seriesWords(want.name).join(' ') === seriesWords(book.series.name).join(' ');
  return same && book.series.index !== want.position;
}

/**
 * "Do we already have this book?" on top of the library adapter: by ISBN
 * first, then by title and first author. A hit costs no indexer call.
 */
export function libraryBookLookup(library: Pick<LibraryAdapter, 'findBooks'>): LibraryLookup {
  return {
    async findBook(query: BookQuery) {
      if (query.isbn13) {
        const [byIsbn] = await library.findBooks({ isbns: [query.isbn13], limit: 1 });
        if (byIsbn) return { calibreBookId: byIsbn.id };
      }
      const author = query.authors[0];
      const byTitle = await library.findBooks({
        title: cleanTitle(query.title),
        ...(author ? { author } : {}),
        limit: TITLE_CANDIDATES,
      });
      const book = byTitle.find((b) => !isOtherBook(query, b));
      return book ? { calibreBookId: book.id } : null;
    },
  };
}
