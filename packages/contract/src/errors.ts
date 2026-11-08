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
  'INTERNAL_ERROR',
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
