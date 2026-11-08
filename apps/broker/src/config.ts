import { z } from 'zod';

/**
 * Every setting comes from the environment. Nothing that identifies the
 * household or unlocks a service has a default value here.
 */
/**
 * An optional secret: unset, empty and the `.env.example` placeholder
 * (`change-me`) all mean "not configured".
 */
const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v !== 'change-me' ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_PATH: z.string().min(1).default('/data/purrshelf.db'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  /** Login attempts per IP per minute, before the account lockout kicks in. */
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

  // Metadata providers (BRK-02, ADR 0007). Hardcover is skipped without a token.
  HARDCOVER_API_TOKEN: optionalSecret,
  /** Optional: Google Books works without a key, at a lower quota. */
  GOOGLE_BOOKS_API_KEY: optionalSecret,
  METADATA_CACHE_DAYS: z.coerce.number().int().positive().default(7),
  METADATA_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /** /health turns "degraded" this many days before the Hardcover token expires. */
  HARDCOVER_TOKEN_WARN_DAYS: z.coerce.number().int().positive().default(30),
});

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid broker configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
