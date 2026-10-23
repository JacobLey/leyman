DROP INDEX "notes_created_at_id";--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "owner" text NOT NULL;--> statement-breakpoint
CREATE INDEX "notes_owner_created_at_id" ON "notes" USING btree ("owner","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);