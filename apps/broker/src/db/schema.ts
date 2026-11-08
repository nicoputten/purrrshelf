import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  locale: text('locale', { enum: ['en', 'nl'] })
    .notNull()
    .default('en'),
  cwaUserId: integer('cwa_user_id'),
  koboShelfId: integer('kobo_shelf_id'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** All tokens from one login share a family; reuse of a rotated token revokes the family. */
    familyId: text('family_id').notNull(),
    /** SHA-256 of the token; the token itself is never stored. */
    hash: text('hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);

/**
 * Newznab indexers. URL and limits live here; the API key never does: it comes
 * from env as INDEXER_<ID>_API_KEY.
 */
export const indexers = sqliteTable('indexers', {
  /** Short slug (a-z, 0-9, _), also the env name of the key. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  /** Lower is queried first; indexers are never queried in parallel. */
  priority: integer('priority').notNull().default(0),
  searchLimitPerHour: integer('search_limit_per_hour').notNull(),
  grabLimitPerHour: integer('grab_limit_per_hour').notNull(),
  /** Cached `t=caps` reply. */
  capsJson: text('caps_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const budgetKinds = ['search', 'grab'] as const;
export type BudgetKind = (typeof budgetKinds)[number];

/** One row per indexer call spent; the rolling 60-minute window is counted from these. */
export const budgetEvents = sqliteTable(
  'budget_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: budgetKinds }).notNull(),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('budget_events_window_idx').on(t.indexerId, t.kind, t.at)],
);

/** Set when the indexer itself answers "limit reached": no spending until `until`. */
export const budgetBlocks = sqliteTable(
  'budget_blocks',
  {
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: budgetKinds }).notNull(),
    until: integer('until', { mode: 'timestamp_ms' }).notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [primaryKey({ columns: [t.indexerId, t.kind] })],
);

export type User = typeof users.$inferSelect;
export type Indexer = typeof indexers.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
