CREATE TABLE `workflow_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer DEFAULT 0 NOT NULL,
	`workflow_id` integer NOT NULL,
	`trigger_type` text NOT NULL,
	`action_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`device_id` text,
	`automation_job_id` integer,
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
CREATE INDEX `workflow_runs_workspace_workflow_created_idx` ON `workflow_runs` (`workspace_id`,`workflow_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `workflow_runs_workspace_status_scheduled_idx` ON `workflow_runs` (`workspace_id`,`status`,`scheduled_for`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_automation_job_unique` ON `workflow_runs` (`automation_job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_workspace_workflow_dedupe_unique` ON `workflow_runs` (`workspace_id`,`workflow_id`,`dedupe_key`);