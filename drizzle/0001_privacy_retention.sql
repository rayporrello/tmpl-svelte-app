-- Privacy retention migration:
-- Drop automation_dead_letters.payload instead of redacting it. Dead letters only need
-- event type, error text, and an optional source event reference for operations; keeping
-- full webhook payloads would duplicate contact PII. event_id is nullable and uses
-- ON DELETE SET NULL so pruning automation_events never blocks on retained dead letters.
ALTER TABLE "automation_dead_letters" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_dead_letters" ADD CONSTRAINT "automation_dead_letters_event_id_automation_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_dead_letters_created_at_idx" ON "automation_dead_letters" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_events_status_created_at_idx" ON "automation_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "automation_dead_letters" DROP COLUMN "payload";
