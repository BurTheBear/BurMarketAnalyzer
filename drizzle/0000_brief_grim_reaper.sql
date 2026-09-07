CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_order` text,
	`halted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_user_created` ON `orders` (`user_id`,`created_at`);