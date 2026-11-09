import type { BookRequest } from '@purrshelf/contract';
import { bookRequest } from '@/test/fakeBroker';
import { daysAgo, needKey, pillState, sheetSections } from './activity';

const req = (over: Record<string, unknown>) => bookRequest(over) as BookRequest;
const at = (h: number) => `2026-01-01T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('pillState', () => {
  it('is hidden with nothing on its way', () => {
    expect(pillState([req({ status: 'pushed' })], new Set())).toEqual({ kind: 'hidden' });
  });

  it('shows the download first, with +N for the other active requests', () => {
    const state = pillState(
      [
        req({ id: 'a', status: 'searching', updatedAt: at(12) }),
        req({ id: 'b', status: 'downloading', updatedAt: at(9) }),
        req({ id: 'c', status: 'waiting_budget', updatedAt: at(10) }),
      ],
      new Set(),
    );
    expect(state).toMatchObject({ kind: 'active', more: 2, request: { id: 'b' } });
  });

  it('lets the newest request that needs me win until I have seen it', () => {
    const list = [
      req({ id: 'a', status: 'downloading' }),
      req({ id: 'b', status: 'not_found', updatedAt: at(9) }),
      req({ id: 'c', status: 'choose_release', updatedAt: at(11) }),
    ];
    expect(pillState(list, new Set())).toMatchObject({
      kind: 'needsYou',
      more: 1,
      request: { id: 'c' },
    });
    const seen = new Set(list.slice(1).map(needKey));
    expect(pillState(list, seen)).toMatchObject({ kind: 'active', request: { id: 'a' } });
    // A new failure of the same request shows again.
    expect(pillState([req({ id: 'b', status: 'download_failed' })], seen)).toMatchObject({
      kind: 'needsYou',
    });
  });
});

describe('sheetSections', () => {
  it('puts needs-you first under Now and the last three finished under Earlier', () => {
    const { now, earlier } = sheetSections([
      req({ id: 'a', status: 'downloading', updatedAt: at(12) }),
      req({ id: 'b', status: 'import_failed', updatedAt: at(1) }),
      req({ id: 'p1', status: 'pushed', updatedAt: at(1) }),
      req({ id: 'p2', status: 'in_library', updatedAt: at(4) }),
      req({ id: 'p3', status: 'pushed', updatedAt: at(3) }),
      req({ id: 'p4', status: 'pushed', updatedAt: at(2) }),
      req({ id: 'x', status: 'cancelled' }),
    ]);
    expect(now.map((r) => r.id)).toEqual(['b', 'a']);
    expect(earlier.map((r) => r.id)).toEqual(['p2', 'p3', 'p4']);
  });
});

describe('daysAgo', () => {
  it('counts calendar days, never below zero', () => {
    const now = new Date(2026, 0, 3, 9, 0);
    expect(daysAgo(new Date(2026, 0, 3, 1, 0).toISOString(), now)).toBe(0);
    expect(daysAgo(new Date(2026, 0, 2, 23, 0).toISOString(), now)).toBe(1);
    expect(daysAgo(new Date(2025, 11, 31, 12, 0).toISOString(), now)).toBe(3);
    expect(daysAgo(new Date(2026, 0, 4).toISOString(), now)).toBe(0);
  });
});
