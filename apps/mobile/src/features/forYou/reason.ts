import type { Recommendation, RecommendationRow } from '@purrshelf/contract';
import type { TFunction } from 'i18next';

/** Up to two decimals, without trailing zeros: 2, 2.5. */
function position(n: number | null): string {
  return n === null ? '' : String(Math.round(n * 100) / 100);
}

/**
 * The one ginger line under a card (board 10): why this book. The broker
 * sends facts; the words are ours, in English and Dutch. Authors get no
 * pronoun, because nobody knows which one fits.
 */
export function reasonLine(item: Recommendation, t: TFunction): string {
  const r = item.reason;
  switch (r.kind) {
    case 'next_in_series': {
      const base = { series: r.series.name, position: position(r.series.position) };
      if (r.after.position === null)
        return t('forYou.reason.seriesNext', { ...base, title: r.after.title });
      const after = position(r.after.position);
      if (r.after.basis === 'reading') return t('forYou.reason.seriesReading', { ...base, after });
      if (r.after.basis === 'owned') return t('forYou.reason.seriesOwned', { ...base, after });
      return t('forYou.reason.seriesFinished', { ...base, after });
    }
    case 'author':
      if (r.basis === 'owned') return t('forYou.reason.authorOwned', { count: r.count });
      return r.count === 1 && r.title
        ? t('forYou.reason.authorOne', { title: r.title })
        : t('forYou.reason.authorMany', { count: r.count });
    case 'partner_shelf':
      return r.partnerFinished
        ? t('forYou.reason.partnerFinished', { name: r.partner.displayName })
        : t('forYou.reason.partnerShelf', { name: r.partner.displayName });
  }
}

/** Row title and its quiet sort hint. */
export function rowTitle(
  row: RecommendationRow,
  readingData: boolean,
  t: TFunction,
): { title: string; hint: string } {
  switch (row.kind) {
    case 'next_in_series':
      return { title: t('forYou.rows.next_in_series'), hint: t('forYou.rows.next_in_seriesHint') };
    case 'author':
      return {
        title: readingData ? t('forYou.rows.author') : t('forYou.rows.authorOwned'),
        hint: t('forYou.rows.authorHint'),
      };
    case 'partner_shelf':
      return {
        title: t('forYou.rows.partner_shelf', { name: row.partner?.displayName ?? '' }),
        hint: t('forYou.rows.partner_shelfHint'),
      };
  }
}

/** "Instant": a reader's partner already has the file, so adding needs no download. */
export function isInstant(item: Recommendation): boolean {
  return item.work.library?.owners.some((o) => !o.me) ?? false;
}

/** Short request status for a card, or null when the reader hasn't added it. */
export function requestLine(item: Recommendation, t: TFunction): string | null {
  const status = item.request?.status;
  if (!status || status === 'in_library' || status === 'pushed' || status === 'cancelled') {
    return null;
  }
  return t(`forYou.request.${status}`);
}
