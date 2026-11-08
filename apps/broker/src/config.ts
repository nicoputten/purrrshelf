import { z } from 'zod';

/**
 * Every setting comes from the environment. Nothing that identifies the
 * household or unlocks a service has a default value here.
 */
export const DEFAULT_TRUST_PROXY = 'loopback,linklocal,uniquelocal';
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
  /**
   * Which peers may set X-Forwarded-For (ADR 0018): a comma-separated list of
   * IPs, CIDRs or the names `loopback`, `linklocal`, `uniquelocal`; `none`
   * trusts nobody. The default trusts private networks, where Nginx Proxy
   * Manager runs. `true` (trust everyone) is refused: any client could then
   * pick its own IP and dodge the login rate limit.
   */
  TRUST_PROXY: z
    .string()
    .trim()
    .default(DEFAULT_TRUST_PROXY)
    .refine((v) => v.toLowerCase() !== 'true', {
      message: 'trusting every peer lets clients spoof their IP; list the proxy instead',
    })
    .refine((v) => v !== '', { message: 'use "none" to trust no proxy' })
    .transform((v): string | false => (['none', 'false'].includes(v.toLowerCase()) ? false : v)),

  // Metadata providers (BRK-02, ADR 0007). Hardcover is skipped without a token.
  HARDCOVER_API_TOKEN: optionalSecret,
  /** Optional: Google Books works without a key, at a lower quota. */
  GOOGLE_BOOKS_API_KEY: optionalSecret,
  METADATA_CACHE_DAYS: z.coerce.number().int().positive().default(7),
  METADATA_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /** /health turns "degraded" this many days before the Hardcover token expires. */
  HARDCOVER_TOKEN_WARN_DAYS: z.coerce.number().int().positive().default(30),

  /** Downloaded covers in three sizes (BRK-07). */
  COVERS_PATH: z.string().min(1).default('/data/covers'),

  // Calibre-Web-Automated (ADR 0017). Without CWA_BASE_URL the library is off.
  CWA_BASE_URL: z.url().optional(),
  CWA_SERVICE_USER: z.string().min(1).optional(),
  CWA_SERVICE_PASSWORD: z.string().min(1).optional(),
  CWA_KOBO_SHELF_NAME: z.string().min(1).default('Kobo'),
  CALIBRE_LIBRARY_PATH: z.string().min(1).default('/calibre-library'),
  CWA_CONFIG_PATH: z.string().min(1).default('/cwa-config'),
  CWA_INGEST_PATH: z.string().min(1).default('/cwa-book-ingest'),

  // SABnzbd (BRK-06). Without SABNZBD_URL nothing is downloaded; results are only listed.
  SABNZBD_URL: z.url().optional(),
  SABNZBD_API_KEY: optionalSecret,
  SABNZBD_CATEGORY: z.string().min(1).default('kobopush'),
  /** SABnzbd's kobopush complete folder, mounted read-only in the broker. */
  DOWNLOADS_PATH: z.string().min(1).default('/downloads'),
  DOWNLOAD_POLL_SECONDS: z.coerce.number().int().positive().default(15),
  /** How long to wait for CWA to show an ingested book in metadata.db. */
  IMPORT_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  /** Size cap for the ebook file taken from a download. */
  MAX_BOOK_MB: z.coerce.number().positive().default(50),

  // In-app updates (BRK-10, ADR 0031). Off unless the release repo is set.
  /** GitHub repository (`owner/name`) whose `mobile-v*` releases carry the APK. */
  APP_RELEASES_REPO: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v !== 'change-me' ? v : undefined))
    .refine((v) => v === undefined || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v), {
      message: 'must look like owner/name',
    }),
  /**
   * The broker asks GitHub at most once per this many minutes, and only when the app asks.
   * Short, so a tap on "Check for updates" sees a new release almost at once.
   */
  APP_UPDATE_CHECK_MINUTES: z.coerce.number().int().positive().default(2),
  /** Where the downloaded APK is kept, on the /data volume. */
  APP_UPDATES_PATH: z.string().min(1).default('/data/app-updates'),
  MAX_APK_MB: z.coerce.number().positive().default(200),
});

const configSchema = envSchema.superRefine((env, ctx) => {
  if (env.CWA_BASE_URL) {
    for (const key of ['CWA_SERVICE_USER', 'CWA_SERVICE_PASSWORD'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'required with CWA_BASE_URL' });
    }
  }
  if (env.SABNZBD_URL && !env.SABNZBD_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['SABNZBD_API_KEY'],
      message: 'required with SABNZBD_URL',
    });
  }
});

export type Config = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid broker configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
