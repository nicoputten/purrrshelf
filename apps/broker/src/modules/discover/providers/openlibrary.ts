import { z } from 'zod';
import { ProviderError, requestJson, type HttpOptions } from '../http.js';
import { blankToNull, languageCode, normaliseIsbns, yearOf } from '../normalise.js';
import type { MetadataProvider, MetadataQuery, ProviderWork } from '../types.js';

export const OPEN_LIBRARY_URL = 'https://openlibrary.org';
const COVERS_URL = 'https://covers.openlibrary.org';

const strList = z.array(z.string()).nullish().catch(null);

const SearchDoc = z.object({
  key: z.string(),
  title: z.string(),
  subtitle: z.string().nullish().catch(null),
  author_name: strList,
  isbn: strList,
  language: strList,
  first_publish_year: z.number().nullish().catch(null),
  cover_i: z.number().nullish().catch(null),
  number_of_pages_median: z.number().nullish().catch(null),
});

const SearchResponse = z.object({ docs: z.array(z.unknown()) });

const Work = z.object({
  title: z.string(),
  subtitle: z.string().nullish().catch(null),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .nullish()
    .catch(null),
  covers: z.array(z.number()).nullish().catch(null),
  subjects: strList,
  first_publish_date: z.string().nullish().catch(null),
  authors: z
    .array(z.object({ author: z.object({ key: z.string() }).nullish().catch(null) }))
    .nullish()
    .catch(null),
});

const Author = z.object({ name: z.string() });

const SEARCH_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'isbn',
  'language',
  'first_publish_year',
  'cover_i',
  'number_of_pages_median',
].join(',');

const LANGUAGE_PARAM = { en: 'eng', nl: 'dut' } as const;

/** `/works/OL27448W` → `OL27448W`. */
function workId(key: string): string | null {
  const m = key.match(/(OL\d+W)$/);
  return m?.[1] ?? null;
}

function coverUrl(id: number | null | undefined): string | null {
  return id && id > 0 ? `${COVERS_URL}/b/id/${id}-L.jpg` : null;
}

export class OpenLibraryProvider implements MetadataProvider {
  readonly name = 'openlibrary' as const;
  /** Needs no key. */
  readonly configured = true;

  constructor(private readonly http: HttpOptions) {}

  async search(query: MetadataQuery): Promise<ProviderWork[]> {
    const params = new URLSearchParams({ title: query.title, fields: SEARCH_FIELDS, limit: '20' });
    if (query.author) params.set('author', query.author);
    if (query.language !== 'any') params.set('language', LANGUAGE_PARAM[query.language]);
    const json = await requestJson(this.http, `${OPEN_LIBRARY_URL}/search.json?${params}`);
    const parsed = SearchResponse.safeParse(json);
    if (!parsed.success) throw new ProviderError('Open Library search reply has an unknown shape');
    return parsed.data.docs.flatMap((raw) => {
      const doc = SearchDoc.safeParse(raw);
      const id = doc.success ? workId(doc.data.key) : null;
      if (!doc.success || !id) return [];
      const d = doc.data;
      const languages = (d.language ?? []).map(languageCode);
      const wanted = query.language !== 'any' ? query.language : null;
      return [
        {
          provider: this.name,
          id,
          title: d.title,
          subtitle: blankToNull(d.subtitle),
          authors: d.author_name ?? [],
          language: wanted && languages.includes(wanted) ? wanted : (languages[0] ?? null),
          series: null,
          publishedYear: yearOf(d.first_publish_year),
          isbns: normaliseIsbns(d.isbn ?? []),
          coverUrl: coverUrl(d.cover_i),
          pageCount: d.number_of_pages_median ?? null,
        },
      ];
    });
  }

  async getWork(id: string): Promise<ProviderWork | null> {
    if (!/^OL\d+W$/.test(id)) return null;
    const json = await requestJson(this.http, `${OPEN_LIBRARY_URL}/works/${id}.json`);
    if (json === undefined) return null;
    const parsed = Work.safeParse(json);
    if (!parsed.success) throw new ProviderError('Open Library work reply has an unknown shape');
    const w = parsed.data;
    const authorKeys = (w.authors ?? [])
      .flatMap((a) => (a.author ? [a.author.key] : []))
      .filter((k) => /^\/authors\/OL\d+A$/.test(k))
      .slice(0, 3);
    const authors = await Promise.all(
      authorKeys.map(async (key) => {
        const a = Author.safeParse(await requestJson(this.http, `${OPEN_LIBRARY_URL}${key}.json`));
        return a.success ? a.data.name : null;
      }),
    );
    const description = typeof w.description === 'string' ? w.description : w.description?.value;
    return {
      provider: this.name,
      id,
      title: w.title,
      subtitle: blankToNull(w.subtitle),
      authors: authors.filter((a): a is string => a !== null),
      language: null,
      series: null,
      publishedYear: yearOf(w.first_publish_date),
      isbns: [],
      coverUrl: coverUrl(w.covers?.[0]),
      description: blankToNull(description),
      subjects: (w.subjects ?? []).slice(0, 10),
      pageCount: null,
    };
  }
}
