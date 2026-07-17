CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`summary` text NOT NULL,
	`spend_cents` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `automation_runs_started_idx` ON `automation_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`website_status` text DEFAULT 'unknown' NOT NULL,
	`source` text NOT NULL,
	`source_ref` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'discovered' NOT NULL,
	`score` integer DEFAULT 50 NOT NULL,
	`do_not_call` integer DEFAULT false NOT NULL,
	`estimated_site_cost_cents` integer DEFAULT 90000 NOT NULL,
	`requirements` text DEFAULT '' NOT NULL,
	`preferred_style` text DEFAULT '' NOT NULL,
	`next_action` text DEFAULT 'Review prospect' NOT NULL,
	`next_action_at` text,
	`last_contact_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `businesses_stage_idx` ON `businesses` (`stage`);--> statement-breakpoint
CREATE INDEX `businesses_campaign_idx` ON `businesses` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `businesses_next_action_idx` ON `businesses` (`next_action_at`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`status` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calls_business_idx` ON `calls` (`business_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`vertical` text NOT NULL,
	`region` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`daily_lead_limit` integer DEFAULT 20 NOT NULL,
	`daily_spend_cap_cents` integer DEFAULT 2500 NOT NULL,
	`pricing_floor_cents` integer DEFAULT 150000 NOT NULL,
	`pitch_script` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaigns_status_idx` ON `campaigns` (`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_business_idx` ON `messages` (`business_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`reference` text NOT NULL,
	`paid_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `payments_business_idx` ON `payments` (`business_id`);--> statement-breakpoint
CREATE TABLE `pitch_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`label` text NOT NULL,
	`script` text NOT NULL,
	`status` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`positive_outcomes` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pitch_versions_campaign_idx` ON `pitch_versions` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`status` text NOT NULL,
	`brief` text NOT NULL,
	`preview_token` text NOT NULL,
	`production_url` text,
	`revision_count` integer DEFAULT 0 NOT NULL,
	`delivered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_business_unique` ON `projects` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_preview_token_unique` ON `projects` (`preview_token`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`estimated_cost_cents` integer NOT NULL,
	`configured_floor_cents` integer NOT NULL,
	`multiplier_floor_cents` integer NOT NULL,
	`enforced_floor_cents` integer NOT NULL,
	`proposed_price_cents` integer NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quotes_business_idx` ON `quotes` (`business_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_started_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'operator' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);