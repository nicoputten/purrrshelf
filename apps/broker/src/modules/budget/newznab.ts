import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { IndexerLimitReachedError, IndexerRequestError } from './budget.js';

export { IndexerRequestError };

/**
 * Raw Newznab HTTP client. Only {@link IndexerGateway} may use it, so that
 * every call is paid for through the budget (a test enforces this).
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NewznabEndpoint {
  url: string;
  apiKey: string;
}

/** Search parameters, without the API key. */
export type NewznabParams = Record<string, string>;

export interface NewznabItem {
  guid: string;
  title: string;
  /** Bytes, when the indexer says. */
  size: number | null;
  category: string | null;
  grabs: number | null;
  language: string | null;
  publishedAt: Date | null;
}

export interface NewznabCaps {
  /** `t=book` is available. */
  bookSearch: boolean;
  /** Parameters `t=book` accepts, e.g. title, author. */
  bookParams: string[];
}

const TIMEOUT_MS = 20_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => name === 'item' || name === 'attr',
  parseAttributeValue: false,
  parseTagValue: false,
});

const Attr = z.object({ name: z.string(), value: z.string() });
const Item = z.object({
  title: z.string().min(1),
  guid: z.union([z.string(), z.object({ '#text': z.string() })]).optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
  enclosure: z.object({ length: z.string().optional() }).optional(),
  attr: z.array(Attr).optional(),
});
const Feed = z.object({
  rss: z.object({
    channel: z.object({ item: z.array(z.unknown()).optional() }).optional(),
  }),
});
const ErrorReply = z.object({
  error: z.object({ code: z.string(), description: z.string().optional() }),
});
/** An empty element (`<searching/>`) parses as '', so treat it as an empty object. */
const element = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? {} : v), schema);
const CapsReply = z.object({
  caps: element(
    z.object({
      searching: element(
        z.object({
          'book-search': z
            .object({ available: z.string(), supportedParams: z.string().optional() })
            .optional(),
        }),
      ).optional(),
    }),
  ),
});

/** Parses XML, or returns undefined when it is not well-formed. */
function parseXml(text: string): unknown {
  return XMLValidator.validate(text) === true ? parser.parse(text) : undefined;
}

function int(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The id that t=get accepts. Many indexers send the guid as a permalink
 * (`https://host/details/<id>` or `...?id=<id>`); t=get needs the bare id.
 */
function idFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const id = url.searchParams.get('id');
  if (id) return id;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.length > 1 ? (segments.pop() as string) : null;
}

function guidOf(item: z.infer<typeof Item>): string | null {
  const guid = typeof item.guid === 'string' ? item.guid : item.guid?.['#text'];
  if (guid && !/^https?:\/\//i.test(guid)) return guid;
  const fromGuid = guid ? idFromUrl(guid) : null;
  if (fromGuid) return fromGuid;
  // Some indexers only give the NZB link; its id parameter is the guid.
  return item.link ? (new URL(item.link).searchParams.get('id') ?? item.link) : (guid ?? null);
}

function toItem(raw: unknown): NewznabItem | null {
  const parsed = Item.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const guid = guidOf(item);
  if (!guid) return null;
  const attrs = new Map((item.attr ?? []).map((a) => [a.name.toLowerCase(), a.value]));
  const date = item.pubDate ? new Date(item.pubDate) : null;
  return {
    guid,
    title: item.title,
    size: int(attrs.get('size') ?? item.enclosure?.length),
    category: attrs.get('category') ?? null,
    grabs: int(attrs.get('grabs')),
    language: attrs.get('language') ?? null,
    publishedAt: date && !Number.isNaN(date.getTime()) ? date : null,
  };
}

/** Newznab error codes 500 (request limit) and 501 (download limit) mean "stop spending". */
const LIMIT_CODES = new Set(['429', '500', '501']);

function checkError(doc: unknown): void {
  const err = ErrorReply.safeParse(doc);
  if (!err.success) return;
  const { code, description = 'Indexer error' } = err.data.error;
  if (LIMIT_CODES.has(code)) throw new IndexerLimitReachedError(description);
  throw new IndexerRequestError(`Indexer error ${code}: ${description}`, { code });
}

function retryAfter(res: Response, now: Date): Date | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return new Date(now.getTime() + seconds * 1000);
  const date = new Date(header);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export class NewznabClient {
  constructor(
    private readonly fetch: FetchLike,
    private readonly now: () => Date,
  ) {}

  private async request(endpoint: NewznabEndpoint, params: NewznabParams): Promise<Response> {
    const url = new URL(`${endpoint.url}/api`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('apikey', endpoint.apiKey);
    let res: Response;
    try {
      res = await this.fetch(url.toString(), {
        headers: { accept: 'application/xml, application/x-nzb' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw new IndexerRequestError('Indexer not reachable', { cause });
    }
    if (res.status === 429) {
      throw new IndexerLimitReachedError('Too many requests', retryAfter(res, this.now()));
    }
    return res;
  }

  private async xml(endpoint: NewznabEndpoint, params: NewznabParams): Promise<unknown> {
    const res = await this.request(endpoint, params);
    const doc = parseXml(await res.text());
    if (doc === undefined) throw new IndexerRequestError('Indexer reply is not XML');
    checkError(doc);
    if (!res.ok) throw new IndexerRequestError(`Indexer answered HTTP ${res.status}`);
    return doc;
  }

  async search(endpoint: NewznabEndpoint, params: NewznabParams): Promise<NewznabItem[]> {
    const doc = Feed.safeParse(
      await this.xml(endpoint, { extended: '1', limit: '100', ...params }),
    );
    if (!doc.success) throw new IndexerRequestError('Indexer reply is not a Newznab feed');
    return (doc.data.rss.channel?.item ?? []).flatMap((raw) => toItem(raw) ?? []);
  }

  async caps(endpoint: NewznabEndpoint): Promise<NewznabCaps> {
    const doc = CapsReply.safeParse(await this.xml(endpoint, { t: 'caps' }));
    if (!doc.success) throw new IndexerRequestError('Indexer reply is not a caps document');
    const book = doc.data.caps.searching?.['book-search'];
    return {
      bookSearch: book?.available === 'yes',
      bookParams: (book?.supportedParams ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    };
  }

  /** Downloads the NZB file for one release (counts as a grab). */
  async nzb(endpoint: NewznabEndpoint, guid: string): Promise<Buffer> {
    const res = await this.request(endpoint, { t: 'get', id: guid });
    const body = Buffer.from(await res.arrayBuffer());
    const head = body.subarray(0, 512).toString('utf8');
    if (!head.includes('<nzb')) {
      // Maybe an error document instead of an NZB.
      checkError(parseXml(body.toString('utf8')));
      throw new IndexerRequestError(
        res.ok ? 'Indexer did not return an NZB' : `Indexer answered HTTP ${res.status}`,
      );
    }
    if (!res.ok) throw new IndexerRequestError(`Indexer answered HTTP ${res.status}`);
    return body;
  }
}
