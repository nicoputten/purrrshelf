import type { LibraryState } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import type { BadgeTone } from '@/components/Badge';

export interface BadgeSpec {
  label: string;
  tone: BadgeTone;
}

/**
 * Ownership badges for a hit, in the order the canvas shows them:
 * "On your Kobo" (or "Yours" when it is not on the device), then one
 * "<name> has it" per other owner.
 */
export function libraryBadges(library: LibraryState | null, t: TFunction): BadgeSpec[] {
  if (!library) return [];
  const badges: BadgeSpec[] = [];
  const mine = library.owners.some((o) => o.me);
  if (library.onMyKobo) badges.push({ label: t('search.onYourKobo'), tone: 'success' });
  else if (mine) badges.push({ label: t('search.yours'), tone: 'mine' });
  for (const o of library.owners.filter((o) => !o.me)) {
    badges.push({ label: t('search.ownerHasIt', { name: o.displayName }), tone: 'partner' });
  }
  if (badges.length === 0) badges.push({ label: t('search.inLibrary'), tone: 'success' });
  return badges;
}
