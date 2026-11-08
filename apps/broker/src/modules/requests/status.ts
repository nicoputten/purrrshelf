import type { RequestStatus } from '../../db/schema.js';

/**
 * The request status machine:
 * searching → waiting_budget → searching → not_found | choose_release | downloading
 * → importing → in_library → pushed; failures download_failed and import_failed.
 * not_found and the failures offer "Try again" (back to searching).
 */
export const transitions: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  searching: [
    'waiting_budget',
    // Every NZB of the auto-pick failed, or SABnzbd refused it.
    'download_failed',
    'not_found',
    'choose_release',
    'downloading',
    'in_library',
    'cancelled',
  ],
  waiting_budget: ['searching', 'cancelled'],
  not_found: ['searching', 'cancelled'],
  choose_release: ['downloading', 'searching', 'cancelled'],
  downloading: ['downloading', 'importing', 'download_failed', 'choose_release', 'cancelled'],
  download_failed: ['downloading', 'searching', 'cancelled'],
  importing: ['in_library', 'import_failed'],
  import_failed: ['searching', 'downloading', 'cancelled'],
  in_library: ['pushed'],
  pushed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  override name = 'InvalidTransitionError';
  constructor(
    public readonly from: RequestStatus,
    public readonly to: RequestStatus,
  ) {
    super(`A request cannot go from ${from} to ${to}`);
  }
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Statuses from which "Try again" (a new, paid search) is offered. */
export function canRetry(status: RequestStatus): boolean {
  return canTransition(status, 'searching') && status !== 'waiting_budget';
}
