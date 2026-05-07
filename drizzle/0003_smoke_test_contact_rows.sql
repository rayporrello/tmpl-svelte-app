ALTER TABLE "contact_submissions" ADD COLUMN "is_smoke_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "contact_submissions_is_smoke_test_idx" ON "contact_submissions" USING btree ("is_smoke_test");
