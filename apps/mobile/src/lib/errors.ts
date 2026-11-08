import { ApiError, NetworkError } from '@purrshelf/contract';
import type { TFunction } from 'i18next';

/** Turns any error from the API layer into a translated, user-facing sentence. */
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.code === 'ACCOUNT_LOCKED') {
      const seconds = (err.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      return t('errors.ACCOUNT_LOCKED', { minutes: Math.max(1, Math.ceil((seconds ?? 60) / 60)) });
    }
    return t(`errors.${err.code}`);
  }
  if (err instanceof NetworkError) {
    return err.message === 'Server not reachable'
      ? t('errors.unreachable')
      : t('errors.notPurrshelf');
  }
  if (err instanceof TypeError && err.message === 'Invalid URL') return t('errors.invalidUrl');
  return t('errors.unknown');
}
