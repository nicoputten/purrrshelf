CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text,
	`calibre_book_id` integer NOT NULL,
	`media_type` text DEFAULT 'ebook' NOT NULL,
	`title` text NOT NULL,
	`added_at` integer NOT NULL,
	`delete_after` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_items_calibre_book_id_unique` ON `library_items` (`calibre_book_id`);--> statement-breakpoint
CREATE INDEX `library_items_work_idx` ON `library_items` (`work_id`);--> statement-breakpoint
CREATE TABLE `ownerships` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ownerships_user_idx` ON `ownerships` (`user_id`);