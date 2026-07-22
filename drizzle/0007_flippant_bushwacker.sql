CREATE TABLE `agent_chat_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer DEFAULT 0 NOT NULL,
	`title` text DEFAULT '新对话' NOT NULL,
	`expert_id` text DEFAULT '' NOT NULL,
	`expert_name` text DEFAULT '通用业务助手' NOT NULL,
	`model_tier` text DEFAULT 'smart' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_chat_conversations_workspace_updated_idx` ON `agent_chat_conversations` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `agent_chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer DEFAULT 0 NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_chat_messages_workspace_conversation_created_idx` ON `agent_chat_messages` (`workspace_id`,`conversation_id`,`created_at`);