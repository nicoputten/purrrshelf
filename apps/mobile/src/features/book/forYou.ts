import type { LibraryState, Recommendation } from '@purrshelf/contract';
import type { TFunction } from 'i18next';
import { reasonLine } from '@/features/forYou/reason';

/** The route param a For you card opens the book page with (agreed with APP-12). */
export const FROM_FOR_YOU = 'for-you';

/** "For you · From <partner>'s shelf, <partner> finished it" (board 11). */
export function bannerText(item: Recommendation, t: TFunction): string {
  const r = item.reason;
  if (r.kind === 'partner_shelf') {
    const name = r.partner.displayName;
    return r.partnerFinished
      ? t('book.forYou.bannerPartnerFinished', { name })
      : t('book.forYou.bannerPartner', { name });
  }
  return t('book.forYou.banner', { reason: reasonLine(item, t) });
}

/**
 * The partner whose file I can take at once: the book is in the library and
 * I don't own it yet. Null when the normal Add flow applies.
 */
export function instantFrom(item: Recommendation, library: LibraryState | null): string | null {
  if (!library || library.owners.some((o) => o.me)) return null;
  const r = item.reason;
  if (r.kind === 'partner_shelf' && library.owners.some((o) => o.id === r.partner.id)) {
    return r.partner.displayName;
  }
  return library.owners[0]?.displayName ?? null;
}
