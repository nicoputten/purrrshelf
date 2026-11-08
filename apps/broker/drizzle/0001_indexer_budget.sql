CREATE TABLE `budget_blocks` (
	`indexer_id` text NOT NULL,
	`kind` text NOT NULL,
	`until` integer NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`indexer_id`, `kind`),
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `budget_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`indexer_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budget_events_window_idx` ON `budget_events` (`indexer_id`,`kind`,`at`);--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`search_limit_per_hour` integer NOT NULL,
	`grab_limit_per_hour` integer NOT NULL,
	`caps_json` text,
	`created_at` integer NOT NULL
);
