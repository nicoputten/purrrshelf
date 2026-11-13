CREATE TABLE `kobo_resends` (
	`user_id` text NOT NULL,
	`calibre_book_id` integer NOT NULL,
	`phase` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`since` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `calibre_book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
