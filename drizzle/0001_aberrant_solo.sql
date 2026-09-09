-- Hand-added, and it has to come first: `gin_trgm_ops` below does not exist
-- until pg_trgm is installed. drizzle-kit does not track extensions, so this
-- line is written here rather than generated. pg_trgm is a *trusted* extension
-- since Postgres 13, so the database owner can install it without superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "footballer_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"footballer_id" uuid NOT NULL,
	"term" text NOT NULL,
	"is_canonical" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "footballer_names" ADD CONSTRAINT "footballer_names_footballer_id_footballers_id_fk" FOREIGN KEY ("footballer_id") REFERENCES "public"."footballers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "footballer_names_footballer_id_term_key" ON "footballer_names" USING btree ("footballer_id","term");--> statement-breakpoint
CREATE INDEX "footballer_names_term_prefix_idx" ON "footballer_names" USING btree ("term" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "footballer_names_term_trgm_idx" ON "footballer_names" USING gin ("term" gin_trgm_ops);