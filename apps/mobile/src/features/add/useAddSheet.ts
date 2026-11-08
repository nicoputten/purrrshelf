import { create } from 'zustand';

interface AddSheetState {
  /** The work the Add sheet is open for; null while closed. */
  workId: string | null;
  open: (workId: string) => void;
  close: () => void;
}

/** One Add sheet for the whole app, opened from search, book detail and series rows. */
export const useAddSheet = create<AddSheetState>((set) => ({
  workId: null,
  open: (workId) => set({ workId }),
  close: () => set({ workId: null }),
}));
