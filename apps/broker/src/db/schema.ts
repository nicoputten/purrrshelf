import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

/** Every status of the "add a book" lifecycle; see modules/requests/status.ts for the transitions. */
export const requestStatuses = [
  'searching',
  'waiting_budget',
  'not_found',
  'choose_release',
  'downloading',
  'download_failed',
  'importing',
  'import_failed',
  'in_library',
  'pushed',
  'cancelled',
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export const mediaTypes = ['ebook', 'audiobook'] as const;
export type MediaType = (typeof mediaTypes)[number];

/** One "add a book" request by one user. */
export const requests = sqliteTable(
  'requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The work the user added (metadata id); the works table arrives with BRK-02. */
    workId: text('work_id').notNull(),
    /** Snapshot of what is searched for: title, authors, ISBN (see BookQuery). */
    queryJson: text('query_json').notNull(),
    language: text('language', { enum: ['en', 'nl'] }).notNull(),
    mediaType: text('media_type', { enum: mediaTypes }).notNull().default('ebook'),
    status: text('status', { enum: requestStatuses }).notNull(),
    /** JSON array of user ids whose Kobo gets the book. */
    pushToJson: text('push_to_json').notNull().default('[]'),
    /** Set when the library already had the book or the import finished. */
    calibreBookId: integer('calibre_book_id'),
    /** SABnzbd job id of the release being downloaded. */
    downloadId: text('download_id'),
    /** Download progress 0–100 while downloading. */
    progress: integer('progress'),
    /** When the current search round began (Add or Try again); a budget wait resumes it. */
    searchStartedAt: integer('search_started_at', { mode: 'timestamp_ms' }).notNull(),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('requests_user_idx').on(t.userId), index('requests_status_idx').on(t.status)],
);

/** One indexer call made for a request; feeds the hit-rate ordering of query variants. */
export const searchAttempts = sqliteTable(
  'search_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    variant: text('variant').notNull(),
    query: text('query').notNull(),
    resultCount: integer('result_count').notNull(),
    /** At least one acceptable release came back. */
    hit: integer('hit', { mode: 'boolean' }).notNull(),
    /** Indexer calls spent (1 per attempt). */
    cost: integer('cost').notNull(),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('search_attempts_request_idx').on(t.requestId),
    index('search_attempts_variant_idx').on(t.indexerId, t.variant),
  ],
);

export const releaseStatuses = ['candidate', 'grabbed', 'failed', 'rejected'] as const;

/** Every release a search returned, kept for "Pick another" and failure retries. */
export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    guid: text('guid').notNull(),
    title: text('title').notNull(),
    size: integer('size'),
    category: text('category'),
    /** Guessed from the title (epub, azw3, mobi, pdf, …), when it says. */
    format: text('format'),
    language: text('language'),
    grabs: integer('grabs'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    /** Set by release scoring (BRK-06). */
    score: real('score'),
    /** JSON array of reasons the release was left out (see releases/scoring.ts). */
    rejectedJson: text('rejected_json').notNull().default('[]'),
    status: text('status', { enum: releaseStatuses }).notNull().default('candidate'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('releases_request_idx').on(t.requestId)],
);

/** Small persisted job queue (no Redis). */
export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    runAt: integer('run_at', { mode: 'timestamp_ms' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    /** Failed jobs are kept for inspection and never retried automatically. */
    failedAt: integer('failed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('jobs_run_at_idx').on(t.runAt)],
);

export type RequestRow = typeof requests.$inferSelect;
export type SearchAttempt = typeof searchAttempts.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;

/**
 * Metadata provider replies, cached for 7 days (ADR 0007). Values are the
 * broker's normalised JSON, never raw provider replies with keys in them.
 */
export const metadataCache = sqliteTable(
  'metadata_cache',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('metadata_cache_expires_idx').on(t.expiresAt)],
);

/**
 * One row per book in the shared Calibre library (ADR 0009). The book itself
 * lives in Calibre; this links it to the work it was added as.
 */
export const libraryItems = sqliteTable(
  'library_items',
  {
    id: text('id').primaryKey(),
    /** Metadata work id the book was added as; null for books imported without one. */
    workId: text('work_id'),
    calibreBookId: integer('calibre_book_id').notNull().unique(),
    mediaType: text('media_type', { enum: mediaTypes }).notNull().default('ebook'),
    title: text('title').notNull(),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
    /** Set when the last owner left: the book is deleted after this (BRK-08). */
    deleteAfter: integer('delete_after', { mode: 'timestamp_ms' }),
  },
  (t) => [index('library_items_work_idx').on(t.workId)],
);

/** Who owns which library book. A book with no owners is deleted after a grace period. */
export const ownerships = sqliteTable(
  'ownerships',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] }), index('ownerships_user_idx').on(t.userId)],
);

export type LibraryItemRow = typeof libraryItems.$inferSelect;
export type OwnershipRow = typeof ownerships.$inferSelect;
