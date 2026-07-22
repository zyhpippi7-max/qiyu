CREATE TABLE `ai_employee_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer DEFAULT 0 NOT NULL,
	`employee_id` integer NOT NULL,
	`trigger_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`dedupe_key` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`scheduled_for` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_employee_runs_workspace_employee_created_idx` ON `ai_employee_runs` (`workspace_id`,`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_employee_runs_workspace_status_scheduled_idx` ON `ai_employee_runs` (`workspace_id`,`status`,`scheduled_for`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_employee_runs_workspace_employee_dedupe_unique` ON `ai_employee_runs` (`workspace_id`,`employee_id`,`dedupe_key`);