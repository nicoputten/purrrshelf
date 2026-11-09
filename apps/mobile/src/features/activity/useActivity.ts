import { create } from 'zustand';

interface ActivityState {
  /** The Requests sheet (board 14) is open. */
  sheetOpen: boolean;
  /** Needs-you moments the reader has seen by opening the sheet (see `needKey`). */
  seen: ReadonlySet<string>;
  openSheet: () => void;
  closeSheet: () => void;
  /** Marks needs-you moments as seen (the sheet does this while it is open). */
  markSeen: (needKeys: readonly string[]) => void;
}

/**
 * The activity pill and the Requests sheet (APP-14). The sheet opens from the
 * pill or from a budget pill; opening it marks what needs the reader as seen,
 * so the pink pill goes away. Kept for the app session.
 */
export const useActivity = create<ActivityState>((set) => ({
  sheetOpen: false,
  seen: new Set(),
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  markSeen: (needKeys) =>
    set((s) =>
      needKeys.every((k) => s.seen.has(k)) ? s : { seen: new Set([...s.seen, ...needKeys]) },
    ),
}));

/** Test hook. */
export function resetActivity(): void {
  useActivity.setState({ sheetOpen: false, seen: new Set() });
}
