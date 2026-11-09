import type { BookRequest, RequestStatus } from '@purrshelf/contract';

export type NeedStatus = 'not_found' | 'choose_release' | 'download_failed' | 'import_failed';
/** Active statuses without a progress bar, shown with a short word on the pill. */
export type QuietStatus = 'searching' | 'waiting_budget' | 'importing';

/** A request on its way: the pill shows it with the trotting cat (board 13). */
export const ACTIVE: readonly RequestStatus[] = [
  'searching',
  'waiting_budget',
  'downloading',
  'importing',
];
/** A request that waits for the reader: the pink pill and an action in the sheet. */
export const NEEDS_YOU: readonly RequestStatus[] = [
  'not_found',
  'choose_release',
  'download_failed',
  'import_failed',
];
/** Finished requests shown under "Earlier" in the sheet (board 14). */
const DONE: readonly RequestStatus[] = ['in_library', 'pushed'];
/** How many finished requests the sheet shows. */
export const EARLIER_COUNT = 3;

const newestFirst = (a: BookRequest, b: BookRequest) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

/** One needs-you moment: a later failure of the same request shows again. */
export const needKey = (r: Pick<BookRequest, 'id' | 'status'>) => `${r.id}:${r.status}`;

export type PillState =
  | { kind: 'hidden' }
  | { kind: 'needsYou'; request: BookRequest; more: number }
  | { kind: 'active'; request: BookRequest; more: number };

/**
 * What the activity pill shows. A request that needs the reader wins until
 * the reader has opened the sheet once; otherwise the busiest active request
 * (a download first), with "+N" for the others. Nothing on its way: hidden.
 */
export function pillState(requests: readonly BookRequest[], seen: ReadonlySet<string>): PillState {
  const needs = requests
    .filter((r) => NEEDS_YOU.includes(r.status) && !seen.has(needKey(r)))
    .sort(newestFirst);
  if (needs[0]) return { kind: 'needsYou', request: needs[0], more: needs.length - 1 };
  const active = requests
    .filter((r) => ACTIVE.includes(r.status))
    .sort(
      (a, b) =>
        Number(b.status === 'downloading') - Number(a.status === 'downloading') ||
        newestFirst(a, b),
    );
  if (active[0]) return { kind: 'active', request: active[0], more: active.length - 1 };
  return { kind: 'hidden' };
}

/** The sheet's two lists: "Now" (active and needs-you, needs-you first) and "Earlier". */
export function sheetSections(requests: readonly BookRequest[]): {
  now: BookRequest[];
  earlier: BookRequest[];
} {
  const now = requests
    .filter((r) => NEEDS_YOU.includes(r.status) || ACTIVE.includes(r.status))
    .sort(
      (a, b) =>
        Number(NEEDS_YOU.includes(b.status)) - Number(NEEDS_YOU.includes(a.status)) ||
        newestFirst(a, b),
    );
  const earlier = requests
    .filter((r) => DONE.includes(r.status))
    .sort(newestFirst)
    .slice(0, EARLIER_COUNT);
  return { now, earlier };
}

/** Whole days between two moments by the phone's calendar: 0 today, 1 yesterday. */
export function daysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((day(now) - day(then)) / 86_400_000));
}
