CREATE TABLE `automation_pairing_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_pairing_codes_code_hash_unique` ON `automation_pairing_codes` (`code_hash`);--> statement-breakpoint
ALTER TABLE `automation_devices` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `automation_devices_workspace_seen_idx` ON `automation_devices` (`workspace_id`,`last_seen_at`);--> statement-breakpoint
ALTER TABLE `automation_jobs` ADD `workspace_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `automation_jobs_workspace_claim_idx` ON `automation_jobs` (`workspace_id`,`status`,`device_id`,`created_at`);