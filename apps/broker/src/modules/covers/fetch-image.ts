import { isIP } from 'node:net';
import { ProviderError, USER_AGENT, type HttpOptions } from '../discover/http.js';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Downloads a cover image named by a metadata provider. Only public https
 * hosts: never an IP literal or localhost, so a provider reply can't point
 * the broker at the home network.
 */
export async function fetchImage(http: HttpOptions, raw: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError('not a cover URL');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || isIP(host) || host === 'localhost' || !host.includes('.')) {
    throw new ProviderError(`refusing cover URL on ${host}`);
  }
  let res: Response;
  try {
    res = await http.fetch(url.toString(), {
      headers: { accept: 'image/*', 'user-agent': USER_AGENT },
      redirect: 'error',
      signal: AbortSignal.timeout(http.timeoutMs),
    });
  } catch (cause) {
    throw new ProviderError(`cover download from ${host} failed`, { cause });
  }
  if (!res.ok) throw new ProviderError(`${host} answered ${res.status} for a cover`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/'))
    throw new ProviderError(`${host} sent ${type || 'no type'}, not an image`);
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) throw new ProviderError('cover is too large');
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) throw new ProviderError('cover is too large');
  // Open Library answers a 1×1 GIF (43 bytes) for a missing cover.
  if (body.length < 200) throw new ProviderError('cover is empty');
  return body;
}
