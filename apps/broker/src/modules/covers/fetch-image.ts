import { isIP } from 'node:net';
import { ProviderError, USER_AGENT, type HttpOptions } from '../discover/http.js';

const MAX_BYTES = 10 * 1024 * 1024;

const MAX_REDIRECTS = 3;

/** Only public https hosts: never an IP literal or localhost. */
function safeUrl(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new ProviderError('not a cover URL');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || isIP(host) || host === 'localhost' || !host.includes('.')) {
    throw new ProviderError(`refusing cover URL on ${host}`);
  }
  return url;
}

/**
 * Downloads a cover image named by a metadata provider. Only public https
 * hosts: never an IP literal or localhost, so a provider reply can't point
 * the broker at the home network. Redirects are followed by hand (Open
 * Library sends covers on to archive.org), and every hop is checked the
 * same way.
 */
export async function fetchImage(http: HttpOptions, raw: string): Promise<Buffer> {
  let url = safeUrl(raw);
  let res: Response;
  for (let hop = 0; ; hop++) {
    const host = url.hostname;
    try {
      res = await http.fetch(url.toString(), {
        headers: { accept: 'image/*', 'user-agent': USER_AGENT },
        redirect: 'manual',
        signal: AbortSignal.timeout(http.timeoutMs),
      });
    } catch (cause) {
      throw new ProviderError(`cover download from ${host} failed`, { cause });
    }
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get('location');
    if (!location) throw new ProviderError(`${host} answered ${res.status} without a location`);
    if (hop >= MAX_REDIRECTS) throw new ProviderError('too many redirects for a cover');
    url = safeUrl(location, url);
  }
  const host = url.hostname;
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
