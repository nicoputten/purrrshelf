import type { BookRequest } from '@purrshelf/contract';
import { rememberEvent } from '@/components/motion';

type Seen = Pick<BookRequest, 'id' | 'status' | 'release'>;

/** How recent a change must be to still play when the app first sees it. */
export const FRESH_MS = 2 * 60_000;
const recent = (r: Pick<BookRequest, 'updatedAt'>, now: number) =>
  now - Date.parse(r.updatedAt) <= FRESH_MS;

/** Swat plays when a release is grabbed: entering downloading, or a new release while downloading. */
export const swatScope = (r: Pick<BookRequest, 'id'>) => `swat:${r.id}`;
export function swatEvent(r: Seen): string | null {
  return r.status === 'downloading' ? (r.release?.id ?? 'grabbed') : null;
}

/**
 * A grab the app first sees just after it happened (the search ran while the
 * app was closed or Requests was never open) still swats: the download has
 * barely started and the request changed in the last two minutes.
 */
export function swatFresh(r: Seen & Pick<BookRequest, 'progress' | 'updatedAt'>, now = Date.now()) {
  return r.status === 'downloading' && (r.progress ?? 0) <= 5 && recent(r, now);
}

/** Delivered plays when the push to the Kobo is confirmed. */
export const deliveredScope = (r: Pick<BookRequest, 'id'>) => `delivered:${r.id}`;
export function deliveredEvent(r: Seen): string | null {
  return r.status === 'pushed' ? 'pushed' : null;
}

/** A push the app first sees within two minutes of it still plays Delivered. */
export function deliveredFresh(r: Seen & Pick<BookRequest, 'updatedAt'>, now = Date.now()) {
  return r.status === 'pushed' && recent(r, now);
}

/**
 * Notes where a request the app just created stands, so its later grab and
 * push play even if Requests was never open while it was searching.
 */
export function rememberRequest(r: Seen): void {
  rememberEvent(swatScope(r), swatEvent(r));
  rememberEvent(deliveredScope(r), deliveredEvent(r));
}
