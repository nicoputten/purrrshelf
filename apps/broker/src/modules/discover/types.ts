import type { MetadataProviderName, SearchLanguage, SeriesRef } from '@purrshelf/contract';

/** One provider's record of a work, normalised. Never leaves the broker as is. */
export interface ProviderWork {
  provider: MetadataProviderName;
  /** The provider's own id (no prefix). */
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  /** ISO 639-1 where known. */
  language: string | null;
  series: SeriesRef | null;
  publishedYear: number | null;
  /** ISBN-13s. */
  isbns: string[];
  /** Remote cover image; fetched and cached by the broker, never shown to the app directly. */
  coverUrl: string | null;
  description?: string | null;
  subjects?: string[];
  pageCount?: number | null;
}

/** At least one of text, title, author or subject is set. */
export interface MetadataQuery {
  /** Free words from the search field: a title, an author or both ("lena dunham famesick"). */
  text?: string;
  title?: string;
  author?: string;
  /** A subject or genre, for similar books (APP-09). */
  subject?: string;
  language: SearchLanguage;
}

export interface ProviderSeries {
  /** The provider's own series id (no prefix). */
  id: string;
  name: string;
  total: number | null;
  entries: { position: number | null; work: ProviderWork }[];
}

/**
 * A metadata source. Implementations only talk to their own metadata API:
 * nothing in this module may search an indexer (CLAUDE.md, ADR 0005).
 */
export interface MetadataProvider {
  readonly name: MetadataProviderName;
  /** False when the server has no credentials for it; the provider is then skipped. */
  readonly configured: boolean;
  search(query: MetadataQuery): Promise<ProviderWork[]>;
  /** `null` when the provider has no such work. */
  getWork(id: string): Promise<ProviderWork | null>;
  /** Only providers with real series data implement this. */
  getSeries?(id: string): Promise<ProviderSeries | null>;
}
