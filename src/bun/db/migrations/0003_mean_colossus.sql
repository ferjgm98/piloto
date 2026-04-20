PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`worktree_id` text,
	`backend` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`prompt` text,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_sessions`("id", "workspace_id", "worktree_id", "backend", "status", "prompt", "error_message", "created_at", "updated_at") SELECT "id", "workspace_id", "worktree_id", "backend", "status", "prompt", "error_message", "created_at", "updated_at" FROM `agent_sessions`;--> statement-breakpoint
DROP TABLE `agent_sessions`;--> statement-breakpoint
ALTER TABLE `__new_agent_sessions` RENAME TO `agent_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;