CREATE TABLE `recommendation_cache` (
	`user_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`rows_json` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendation_dismissals` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`work_id` text NOT NULL,
	`author` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	PRIMARY KEY(`user_id`, `kind`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recommendation_dismissals_work_idx` ON `recommendation_dismissals` (`user_id`,`work_id`);