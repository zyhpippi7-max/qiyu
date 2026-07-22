CREATE TABLE `workspace_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_owner_user_id_unique` ON `workspaces` (`owner_user_id`);--> statement-breakpoint
DROP INDEX `private_tags_name_unique`;--> statement-breakpoint
ALTER TABLE `private_tags` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `private_tags_workspace_name_unique` ON `private_tags` (`workspace_id`,`name`);--> statement-breakpoint
ALTER TABLE `acquisition_leads` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `acquisition_tasks` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_contacts` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_plans` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `private_runs` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_records` ADD `workspace_id` integer DEFAULT 0 NOT NULL;