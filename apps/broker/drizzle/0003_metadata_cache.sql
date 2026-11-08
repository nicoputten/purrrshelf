CREATE TABLE `metadata_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `metadata_cache_expires_idx` ON `metadata_cache` (`expires_at`);