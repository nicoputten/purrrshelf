import type { SeriesEntry, WorkSeries } from '@purrshelf/contract';

export type SeriesEntryState = 'thisBook' | 'inLibrary' | 'addNext' | 'add';

/**
 * What each series entry shows (canvas board 2): "This book", "In library",
 * "Add next" for the first missing book after the last one we have (or after
 * this book), else "Add".
 */
export function seriesStates(series: WorkSeries, currentId: string): SeriesEntryState[] {
  const owned = (e: SeriesEntry) => e.work.library !== null || e.work.id === currentId;
  const lastOwned = series.entries.reduce((last, e, i) => (owned(e) ? i : last), -1);
  const next = series.entries.findIndex((e, i) => i > lastOwned && !owned(e));
  return series.entries.map((e, i) => {
    if (e.work.id === currentId) return 'thisBook';
    if (e.work.library) return 'inLibrary';
    return i === next ? 'addNext' : 'add';
  });
}

/** "3 of 4" when the series size is known, else "#3". */
export function positionLabel(position: number | null, total: number | null): string | null {
  if (position === null) return null;
  return total ? `${position}/${total}` : `#${position}`;
}
