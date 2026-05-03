-- Durable automation outbox:
-- keep persisted rows payload-minimized, add idempotency and worker claim state.
ALTER TABLE "automation_events" ADD COLUMN "max_attempts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_events" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_events" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "automation_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "automation_events"
SET "idempotency_key" = "event_type" || ':' || "id"
WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "automation_events" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "automation_events_ready_idx" ON "automation_events" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_events_idempotency_key_idx" ON "automation_events" USING btree ("idempotency_key");
