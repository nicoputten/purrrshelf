CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_error` text,
	`failed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_run_at_idx` ON `jobs` (`run_at`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`indexer_id` text NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`size` integer,
	`category` text,
	`format` text,
	`language` text,
	`grabs` integer,
	`published_at` integer,
	`score` real,
	`status` text DEFAULT 'candidate' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `releases_request_idx` ON `releases` (`request_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`work_id` text NOT NULL,
	`query_json` text NOT NULL,
	`language` text NOT NULL,
	`media_type` text DEFAULT 'ebook' NOT NULL,
	`status` text NOT NULL,
	`push_to_json` text DEFAULT '[]' NOT NULL,
	`calibre_book_id` integer,
	`search_started_at` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `requests_user_idx` ON `requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`);--> statement-breakpoint
CREATE TABLE `search_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`indexer_id` text NOT NULL,
	`variant` text NOT NULL,
	`query` text NOT NULL,
	`result_count` integer NOT NULL,
	`hit` integer NOT NULL,
	`cost` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `search_attempts_request_idx` ON `search_attempts` (`request_id`);--> statement-breakpoint
CREATE INDEX `search_attempts_variant_idx` ON `search_attempts` (`indexer_id`,`variant`);