ALTER TABLE `releases` ADD `rejected_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `download_id` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `progress` integer;