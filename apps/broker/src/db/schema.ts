import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export type User = typeof users.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
