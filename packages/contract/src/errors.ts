import { z } from 'zod';

/**
 * Stable error codes. The app translates these (NL/EN), so never rename one;
 * add a new code instead.
 */
export const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'INVALID_REFRESH_TOKEN',
  'RATE_LIMITED',
  'NOT_FOUND',
  'METADATA_UNAVAILABLE',
  'INTERNAL_ERROR',
  'LIBRARY_UNAVAILABLE',
  'KOBO_SHELF_MISSING',
  'KOBO_SYNC_NOT_SET_UP',
  'REQUEST_STATE',
  'RELEASE_UNAVAILABLE',
  'DOWNLOADS_NOT_SET_UP',
  'KOBO_NOT_LINKED',
  'APP_UPDATE_UNAVAILABLE',
] as const;

export const ErrorCode = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z
  .object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  })
  .meta({ id: 'ErrorResponse' });
export type ErrorResponse = z.infer<typeof ErrorResponse>;
