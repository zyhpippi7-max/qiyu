CREATE TABLE `automation_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`version` text DEFAULT '0.1.0' NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_devices_device_id_unique` ON `automation_devices` (`device_id`);--> statement-breakpoint
CREATE TABLE `automation_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`claimed_at` text,
	`finished_at` text
);
