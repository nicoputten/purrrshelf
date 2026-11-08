ALTER TABLE `indexers` RENAME COLUMN "search_limit_per_hour" TO "search_limit_per_day";--> statement-breakpoint
ALTER TABLE `indexers` RENAME COLUMN "grab_limit_per_hour" TO "grab_limit_per_day";