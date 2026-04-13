PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`backend` text NOT NULL,
	`status` text DEFAULT 'idle',
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_sessions`("id", "workspace_id", "backend", "status", "created_at") SELECT "id", "workspace_id", "backend", "status", "created_at" FROM `agent_sessions`;--> statement-breakpoint
DROP TABLE `agent_sessions`;--> statement-breakpoint
ALTER TABLE `__new_agent_sessions` RENAME TO `agent_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_workspace_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text,
	`default_branch` text DEFAULT 'main',
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workspace_repos`("id", "workspace_id", "path", "name", "default_branch", "order") SELECT "id", "workspace_id", "path", "name", "default_branch", "order" FROM `workspace_repos`;--> statement-breakpoint
DROP TABLE `workspace_repos`;--> statement-breakpoint
ALTER TABLE `__new_workspace_repos` RENAME TO `workspace_repos`;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `description` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `default_branch` text DEFAULT 'main';