import { z } from 'zod';
import { ProviderError, requestJson, type HttpOptions } from '../http.js';
import { blankToNull, fullDate, languageCode, normaliseIsbns, yearOf } from '../normalise.js';
import type { MetadataProvider, MetadataQuery, ProviderSeries, ProviderWork } from '../types.js';

export const HARDCOVER_URL = 'https://api.hardcover.app/v1/graphql';

// Hardcover's API is still changing (ADR 0007), so every field is optional and
// unknown fields are ignored. A record without an id or title is dropped.
const str = z.string().nullish().catch(null);
const num = z.number().nullish().catch(null);
const strList = z.array(z.string()).nullish().catch(null);

const SearchDocument = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  subtitle: str,
  author_names: strList,
  isbns: strList,
  release_year: num,
  image: z.object({ url: str }).nullish().catch(null),
  featured_series: z
    .object({
      position: num,
      series: z
        .object({
          id: z.union([z.string(), z.number()]),
          name: z.string(),
          primary_books_count: num,
        })
        .nullish()
        .catch(null),
    })
    .nullish()
    .catch(null),
});

const SearchResponse = z.object({
  data: z.object({
    search: z.object({
      results: z.object({ hits: z.array(z.object({ document: z.unknown() })).catch([]) }).nullish(),
    }),
  }),
});

const Contributors = z
  .array(z.object({ author: z.object({ name: z.string() }).nullish().catch(null) }))
  .nullish()
  .catch(null);

const BookSeries = z
  .array(
    z.object({
      position: num,
      series: z
        .object({ id: z.number(), name: z.string(), primary_books_count: num })
        .nullish()
        .catch(null),
    }),
  )
  .nullish()
  .catch(null);

const Book = z.object({
  id: z.number(),
  title: z.string(),
  subtitle: str,
  description: str,
  release_year: num,
  release_date: str,
  users_count: num,
  pages: num,
  cached_image: z.object({ url: str }).nullish().catch(null),
  cached_contributors: Contributors,
  cached_tags: z
    .object({
      Genre: z
        .array(z.object({ tag: z.string() }))
        .nullish()
        .catch(null),
    })
    .partial()
    .nullish()
    .catch(null),
  book_series: BookSeries,
  editions: z
    .array(
      z.object({
        isbn_13: str,
        isbn_10: str,
        language: z.object({ code2: str }).nullish().catch(null),
      }),
    )
    .nullish()
    .catch(null),
});
type Book = z.infer<typeof Book>;

const BookResponse = z.object({ data: z.object({ books: z.array(z.unknown()) }) });

const SeriesResponse = z.object({
  data: z.object({
    series: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        primary_books_count: num,
        book_series: z.array(z.object({ position: num, book: z.unknown() })),
      }),
    ),
  }),
});

const SEARCH_QUERY = `query Search($q: String!) {
  search(query: $q, query_type: "Book", per_page: 20, page: 1) { results }
}`;

const BOOK_FIELDS = `id title subtitle description release_year release_date users_count pages cached_image cached_contributors cached_tags
  book_series { position series { id name primary_books_count } }
  editions(limit: 25) { isbn_13 isbn_10 language { code2 } }`;

const BOOK_QUERY = `query Book($id: Int!) {
  books(where: { id: { _eq: $id } }, limit: 1) { ${BOOK_FIELDS} }
}`;

const SERIES_QUERY = `query Series($id: Int!) {
  series(where: { id: { _eq: $id } }, limit: 1) {
    id name primary_books_count
    book_series(order_by: { position: asc }, limit: 200) {
      position
      book { id title subtitle release_year cached_image cached_contributors }
    }
  }
}`;

/** Hardcover tokens are shown on its settings page as `Bearer <jwt>`; accept either form. */
export function bareToken(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, '');
}

export class HardcoverProvider implements MetadataProvider {
  readonly name = 'hardcover' as const;
  readonly configured: boolean;

  constructor(
    private readonly http: HttpOptions,
    private readonly token: string | undefined,
  ) {
    this.configured = Boolean(token);
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const json = (await requestJson(this.http, HARDCOVER_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${bareToken(this.token ?? '')}` },
      body: { query, variables },
    })) as { errors?: { message?: string }[] } | undefined;
    if (!json) throw new ProviderError('Hardcover answered 404');
    if (json.errors?.length) {
      throw new ProviderError(`Hardcover: ${json.errors[0]?.message ?? 'GraphQL error'}`);
    }
    return json;
  }

  async search(query: MetadataQuery): Promise<ProviderWork[]> {
    const q = [query.text, query.title, query.author, query.subject].filter(Boolean).join(' ');
    const parsed = SearchResponse.safeParse(await this.graphql(SEARCH_QUERY, { q }));
    if (!parsed.success) throw new ProviderError('Hardcover search reply has an unknown shape');
    const hits = parsed.data.data.search.results?.hits ?? [];
    return hits.flatMap(({ document }) => {
      const doc = SearchDocument.safeParse(document);
      if (!doc.success) return [];
      const d = doc.data;
      const fs = d.featured_series;
      return [
        {
          provider: this.name,
          id: String(d.id),
          title: d.title,
          subtitle: blankToNull(d.subtitle),
          authors: d.author_names ?? [],
          language: null,
          series: fs?.series
            ? {
                id: `hardcover:${fs.series.id}`,
                name: fs.series.name,
                position: fs.position ?? null,
                total: fs.series.primary_books_count ?? null,
              }
            : null,
          publishedYear: yearOf(d.release_year),
          isbns: normaliseIsbns(d.isbns ?? []),
          coverUrl: blankToNull(d.image?.url),
        },
      ];
    });
  }

  async getWork(id: string): Promise<ProviderWork | null> {
    if (!/^\d+$/.test(id)) return null;
    const parsed = BookResponse.safeParse(await this.graphql(BOOK_QUERY, { id: Number(id) }));
    if (!parsed.success) throw new ProviderError('Hardcover book reply has an unknown shape');
    const book = Book.safeParse(parsed.data.data.books[0]);
    return book.success ? this.toWork(book.data) : null;
  }

  async getSeries(id: string): Promise<ProviderSeries | null> {
    if (!/^\d+$/.test(id)) return null;
    const parsed = SeriesResponse.safeParse(await this.graphql(SERIES_QUERY, { id: Number(id) }));
    if (!parsed.success) throw new ProviderError('Hardcover series reply has an unknown shape');
    const series = parsed.data.data.series[0];
    if (!series) return null;
    const ref = {
      id: `hardcover:${series.id}`,
      name: series.name,
      total: series.primary_books_count ?? null,
    };
    // Hardcover lists every edition-like book per position; keep the first per position.
    const seen = new Set<number>();
    const entries: ProviderSeries['entries'] = [];
    for (const entry of series.book_series) {
      if (entry.position === null || entry.position === undefined || seen.has(entry.position)) {
        continue;
      }
      const book = Book.partial({ description: true }).safeParse(entry.book);
      if (!book.success) continue;
      seen.add(entry.position);
      const work = this.toWork(book.data);
      work.series = { ...ref, position: entry.position };
      entries.push({ position: entry.position, work });
    }
    return { id: String(series.id), name: ref.name, total: ref.total, entries };
  }

  private toWork(book: Partial<Book> & Pick<Book, 'id' | 'title'>): ProviderWork {
    const main = book.book_series?.find((s) => s.series) ?? null;
    const editions = book.editions ?? [];
    const languages = editions.map((e) => languageCode(e.language?.code2)).filter(isString);
    return {
      provider: this.name,
      id: String(book.id),
      title: book.title,
      subtitle: blankToNull(book.subtitle),
      authors: (book.cached_contributors ?? []).flatMap((c) => (c.author ? [c.author.name] : [])),
      language: languages[0] ?? null,
      series: main?.series
        ? {
            id: `hardcover:${main.series.id}`,
            name: main.series.name,
            position: main.position ?? null,
            total: main.series.primary_books_count ?? null,
          }
        : null,
      publishedYear: yearOf(book.release_year),
      isbns: normaliseIsbns(editions.flatMap((e) => [e.isbn_13, e.isbn_10].filter(isString))),
      coverUrl: blankToNull(book.cached_image?.url),
      description: blankToNull(book.description),
      subjects: (book.cached_tags?.Genre ?? []).map((g) => g.tag).slice(0, 10),
      pageCount: book.pages ?? null,
      releaseDate: fullDate(book.release_date),
      languages: [...new Set(languages)],
      readers: readersOf(book.users_count),
    };
  }
}

function readersOf(count: number | null | undefined): number | null {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null;
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
