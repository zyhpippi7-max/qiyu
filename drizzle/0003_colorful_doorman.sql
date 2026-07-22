CREATE TABLE `acquisition_leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer,
	`platform` text NOT NULL,
	`nickname` text NOT NULL,
	`platform_id` text DEFAULT '' NOT NULL,
	`profile_url` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`source_text` text DEFAULT '' NOT NULL,
	`matched_keywords` text DEFAULT '[]' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`converted_contact_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `acquisition_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_type` text DEFAULT 'keyword_search' NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`exclude_keywords` text DEFAULT '[]' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`device_id` text,
	`last_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
