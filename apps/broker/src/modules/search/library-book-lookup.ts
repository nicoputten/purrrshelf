import type { LibraryAdapter } from '../library/types.js';
import { cleanTitle, type BookQuery } from './planner.js';
import type { LibraryLookup } from './service.js';

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
      const [byTitle] = await library.findBooks({
        title: cleanTitle(query.title),
        ...(author ? { author } : {}),
        limit: 1,
      });
      return byTitle ? { calibreBookId: byTitle.id } : null;
    },
  };
}
