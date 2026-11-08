import { z } from 'zod';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SabnzbdConfig {
  url: string;
  apiKey: string;
  category: string;
}

export type DownloadState =
  | { state: 'queued' | 'downloading' | 'paused'; percentage: number }
  | { state: 'processing' }
  | { state: 'completed'; storage: string }
  | { state: 'failed'; message: string }
  | { state: 'missing' };

export class SabnzbdError extends Error {
  override name = 'SabnzbdError';
}

/** What the broker needs from a download client; tests use a fake. */
export interface DownloadClient {
  /** Uploads an NZB into the broker's category; returns SABnzbd's job id. */
  add: (nzb: Buffer, name: string) => Promise<string>;
  status: (nzoId: string) => Promise<DownloadState>;
  remove: (nzoId: string) => Promise<void>;
  ping: () => Promise<void>;
}

const TIMEOUT_MS = 20_000;

const AddReply = z.object({
  status: z.boolean(),
  nzo_ids: z.array(z.string()).optional(),
  error: z.string().optional(),
});
const QueueReply = z.object({
  queue: z.object({
    slots: z.array(
      z.object({ nzo_id: z.string(), status: z.string(), percentage: z.coerce.number().catch(0) }),
    ),
  }),
});
const HistoryReply = z.object({
  history: z.object({
    slots: z.array(
      z.object({
        nzo_id: z.string(),
        status: z.string(),
        fail_message: z.string().optional(),
        storage: z.string().nullable().optional(),
      }),
    ),
  }),
});
const ErrorReply = z.object({ status: z.literal(false), error: z.string() });

/** Post-processing states in SABnzbd's history before it reaches Completed or Failed. */
const PROCESSING = new Set([
  'Queued',
  'QuickCheck',
  'Verifying',
  'Repairing',
  'Fetching',
  'Extracting',
  'Moving',
  'Running',
]);

/** Talks to the SABnzbd JSON API. Never touches the indexer. */
export class SabnzbdClient implements DownloadClient {
  constructor(
    private readonly config: SabnzbdConfig,
    private readonly fetch: FetchLike,
  ) {}

  private url(params: Record<string, string>): string {
    const url = new URL(`${this.config.url.replace(/\/+$/, '')}/api`);
    for (const [k, v] of Object.entries({
      ...params,
      output: 'json',
      apikey: this.config.apiKey,
    })) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private async json(params: Record<string, string>, init: RequestInit = {}): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetch(this.url(params), {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      throw new SabnzbdError('SABnzbd not reachable', { cause });
    }
    if (!res.ok) throw new SabnzbdError(`SABnzbd answered HTTP ${res.status}`);
    let body: unknown;
    try {
      body = await res.json();
    } catch (cause) {
      throw new SabnzbdError('SABnzbd reply is not JSON', { cause });
    }
    const err = ErrorReply.safeParse(body);
    if (err.success) throw new SabnzbdError(`SABnzbd: ${err.data.error}`);
    return body;
  }

  async add(nzb: Buffer, name: string): Promise<string> {
    const form = new FormData();
    const file = name.endsWith('.nzb') ? name : `${name}.nzb`;
    form.append('name', new Blob([new Uint8Array(nzb)], { type: 'application/x-nzb' }), file);
    const reply = AddReply.safeParse(
      await this.json(
        { mode: 'addfile', cat: this.config.category, nzbname: name },
        { method: 'POST', body: form },
      ),
    );
    const id = reply.success && reply.data.status ? reply.data.nzo_ids?.[0] : undefined;
    if (!id) throw new SabnzbdError('SABnzbd did not accept the NZB');
    return id;
  }

  async status(nzoId: string): Promise<DownloadState> {
    const queue = QueueReply.safeParse(await this.json({ mode: 'queue', nzo_ids: nzoId }));
    if (!queue.success) throw new SabnzbdError('SABnzbd queue reply is not valid');
    const slot = queue.data.queue.slots.find((s) => s.nzo_id === nzoId);
    if (slot) {
      const state =
        slot.status === 'Paused'
          ? 'paused'
          : slot.status === 'Downloading'
            ? 'downloading'
            : 'queued';
      return { state, percentage: slot.percentage };
    }
    const history = HistoryReply.safeParse(await this.json({ mode: 'history', nzo_ids: nzoId }));
    if (!history.success) throw new SabnzbdError('SABnzbd history reply is not valid');
    const done = history.data.history.slots.find((s) => s.nzo_id === nzoId);
    if (!done) return { state: 'missing' };
    if (done.status === 'Completed') {
      return done.storage
        ? { state: 'completed', storage: done.storage }
        : { state: 'failed', message: 'SABnzbd finished without a download folder' };
    }
    if (done.status === 'Failed')
      return { state: 'failed', message: done.fail_message || 'Download failed' };
    if (PROCESSING.has(done.status)) return { state: 'processing' };
    return { state: 'failed', message: `Unexpected SABnzbd status ${done.status}` };
  }

  async remove(nzoId: string): Promise<void> {
    await this.json({ mode: 'queue', name: 'delete', value: nzoId });
  }

  async ping(): Promise<void> {
    await this.json({ mode: 'version' });
  }
}
