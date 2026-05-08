CREATE TABLE "automation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"idempotency_key" text NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "automation_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" uuid,
	"event_type" text NOT NULL,
	"error" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"source_path" text,
	"user_agent" text,
	"request_id" text,
	"is_smoke_test" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_dead_letters" ADD CONSTRAINT "automation_dead_letters_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "automation_events_status_created_at_idx" ON "automation_events" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "automation_events_ready_idx" ON "automation_events" USING btree ("status","next_attempt_at","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_events_idempotency_key_idx" ON "automation_events" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "automation_dead_letters_created_at_idx" ON "automation_dead_letters" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "contact_submissions_is_smoke_test_idx" ON "contact_submissions" USING btree ("is_smoke_test");
