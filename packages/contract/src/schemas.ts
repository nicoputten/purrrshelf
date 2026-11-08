import { z } from 'zod';

export const Locale = z.enum(['en', 'nl']);
export type Locale = z.infer<typeof Locale>;

export const LoginRequest = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const TokenPair = z
  .object({
    accessToken: z.string(),
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: z.number().int().positive(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'TokenPair' });
export type TokenPair = z.infer<typeof TokenPair>;

export const RefreshRequest = z
  .object({ refreshToken: z.string().min(1) })
  .meta({ id: 'RefreshRequest' });
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const LogoutRequest = RefreshRequest.meta({ id: 'LogoutRequest' });
export type LogoutRequest = z.infer<typeof LogoutRequest>;

export const Me = z
  .object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    locale: Locale,
    kobo: z.object({ configured: z.boolean() }),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof Me>;

export const HealthCheckResult = z.object({
  name: z.string(),
  status: z.enum(['ok', 'fail']),
  error: z.string().optional(),
});

export const Health = z
  .object({
    /** Marks a Purrshelf broker, so the app can tell it apart from any other server. */
    service: z.literal('purrshelf-broker'),
    status: z.enum(['ok', 'degraded']),
    version: z.string(),
    checks: z.array(HealthCheckResult),
  })
  .meta({ id: 'Health' });
export type Health = z.infer<typeof Health>;

export const Empty = z.object({}).meta({ id: 'Empty' });
