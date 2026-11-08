import type { CoverSize } from '@purrshelf/contract';

/** Pixel sizes, 2:3 like a book. `s` fits a search card at 2x, `l` the detail page at 3x. */
export const COVER_SIZES: Record<CoverSize, { width: number; height: number }> = {
  s: { width: 120, height: 180 },
  m: { width: 240, height: 360 },
  l: { width: 480, height: 720 },
};
