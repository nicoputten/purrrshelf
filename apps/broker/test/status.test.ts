import { describe, expect, it } from 'vitest';
import { requestStatuses } from '../src/db/schema.js';
import {
  assertTransition,
  canRetry,
  canTransition,
  InvalidTransitionError,
  transitions,
} from '../src/modules/requests/status.js';

describe('request status machine', () => {
  it('defines transitions for every status, only to known statuses', () => {
    expect(Object.keys(transitions).sort()).toEqual([...requestStatuses].sort());
    for (const targets of Object.values(transitions)) {
      for (const t of targets) expect(requestStatuses).toContain(t);
    }
  });

  it.each([
    ['searching', 'waiting_budget'],
    ['waiting_budget', 'searching'],
    ['searching', 'not_found'],
    ['searching', 'choose_release'],
    ['searching', 'downloading'],
    ['searching', 'in_library'],
    ['downloading', 'importing'],
    ['importing', 'in_library'],
    ['in_library', 'pushed'],
    ['downloading', 'download_failed'],
    ['importing', 'import_failed'],
    ['not_found', 'searching'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ['waiting_budget', 'downloading'],
    ['pushed', 'searching'],
    ['cancelled', 'searching'],
    ['in_library', 'searching'],
    ['importing', 'cancelled'],
  ] as const)('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    expect(() => assertTransition(from, to)).toThrow(`from ${from} to ${to}`);
  });

  it('offers "Try again" only after a dead end, never while waiting for budget', () => {
    const retryable = requestStatuses.filter(canRetry);
    expect(retryable.sort()).toEqual(
      ['choose_release', 'download_failed', 'import_failed', 'not_found'].sort(),
    );
  });
});
