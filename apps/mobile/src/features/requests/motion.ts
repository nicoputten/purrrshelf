import type { BookRequest } from '@purrshelf/contract';
import { rememberEvent } from '@/components/motion';

type Seen = Pick<BookRequest, 'id' | 'status' | 'release'>;

/** Swat plays when a release is grabbed: entering downloading, or a new release while downloading. */
export const swatScope = (r: Pick<BookRequest, 'id'>) => `swat:${r.id}`;
export function swatEvent(r: Seen): string | null {
  return r.status === 'downloading' ? (r.release?.id ?? 'grabbed') : null;
}

/** Delivered plays when the push to the Kobo is confirmed. */
export const deliveredScope = (r: Pick<BookRequest, 'id'>) => `delivered:${r.id}`;
export function deliveredEvent(r: Seen): string | null {
  return r.status === 'pushed' ? 'pushed' : null;
}

/**
 * Notes where a request the app just created stands, so its later grab and
 * push play even if Requests was never open while it was searching.
 */
export function rememberRequest(r: Seen): void {
  rememberEvent(swatScope(r), swatEvent(r));
  rememberEvent(deliveredScope(r), deliveredEvent(r));
}
