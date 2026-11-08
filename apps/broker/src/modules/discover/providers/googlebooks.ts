import { z } from 'zod';
import { ProviderError, requestJson, type HttpOptions } from '../http.js';
import { blankToNull, languageCode, normaliseIsbns, stripHtml, yearOf } from '../normalise.js';
import type { MetadataProvider, MetadataQuery, ProviderWork } from '../types.js';

export const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1';

const Volume = z.object({
  id: z.string(),
  volumeInfo: z.object({
    title: z.string(),
    subtitle: z.string().nullish().catch(null),
    authors: z.array(z.string()).nullish().catch(null),
    publishedDate: z.string().nullish().catch(null),
    description: z.string().nullish().catch(null),
    industryIdentifiers: z
      .array(z.object({ type: z.string(), identifier: z.string() }))
      .nullish()
      .catch(null),
    pageCount: z.number().nullish().catch(null),
    categories: z.array(z.string()).nullish().catch(null),
    language: z.string().nullish().catch(null),
    imageLinks: z
      .object({ thumbnail: z.string().nullish(), smallThumbnail: z.string().nullish() })
      .partial()
      .nullish()
      .catch(null),
  }),
});
type Volume = z.infer<typeof Volume>;

const SearchResponse = z.object({ items: z.array(z.unknown()).nullish() });

/** Google serves thumbnails over http and small; ask for https and a larger zoom. */
function coverUrl(links: Volume['volumeInfo']['imageLinks']): string | null {
  const url = links?.thumbnail ?? links?.smallThumbnail;
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

export class GoogleBooksProvider implements MetadataProvider {
  readonly name = 'googlebooks' as const;
  /** Works without a key (lower quota); a key raises the quota. */
  readonly configured = true;

  constructor(
    private readonly http: HttpOptions,
    private readonly apiKey: string | undefined,
  ) {}

  private url(path: string, params: URLSearchParams): string {
    if (this.apiKey) params.set('key', this.apiKey);
    return `${GOOGLE_BOOKS_URL}${path}?${params}`;
  }

  async search(query: MetadataQuery): Promise<ProviderWork[]> {
    const q = [`intitle:${query.title}`, query.author ? `inauthor:${query.author}` : null]
      .filter(Boolean)
      .join(' ');
    const params = new URLSearchParams({ q, maxResults: '20', printType: 'books' });
    if (query.language !== 'any') params.set('langRestrict', query.language);
    const parsed = SearchResponse.safeParse(
      await requestJson(this.http, this.url('/volumes', params)),
    );
    if (!parsed.success) throw new ProviderError('Google Books search reply has an unknown shape');
    return (parsed.data.items ?? []).flatMap((raw) => {
      const v = Volume.safeParse(raw);
      return v.success ? [this.toWork(v.data)] : [];
    });
  }

  async getWork(id: string): Promise<ProviderWork | null> {
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
    const json = await requestJson(this.http, this.url(`/volumes/${id}`, new URLSearchParams()));
    if (json === undefined) return null;
    const v = Volume.safeParse(json);
    if (!v.success) throw new ProviderError('Google Books volume reply has an unknown shape');
    return this.toWork(v.data);
  }

  private toWork({ id, volumeInfo: v }: Volume): ProviderWork {
    return {
      provider: this.name,
      id,
      title: v.title,
      subtitle: blankToNull(v.subtitle),
      authors: v.authors ?? [],
      language: languageCode(v.language),
      series: null,
      publishedYear: yearOf(v.publishedDate),
      isbns: normaliseIsbns(
        (v.industryIdentifiers ?? [])
          .filter((i) => i.type === 'ISBN_13' || i.type === 'ISBN_10')
          .map((i) => i.identifier),
      ),
      coverUrl: coverUrl(v.imageLinks),
      description: v.description ? blankToNull(stripHtml(v.description)) : null,
      subjects: (v.categories ?? []).slice(0, 10),
      pageCount: v.pageCount ?? null,
    };
  }
}
