CREATE TABLE `active_worktrees` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`feature_name` text,
	`branch` text NOT NULL,
	`path` text NOT NULL,
	`agent_session_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `workspace_repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_session_id`) REFERENCES `agent_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
