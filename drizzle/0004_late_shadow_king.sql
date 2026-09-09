CREATE TYPE "public"."daily_challenge_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TABLE "challenge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_challenge_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"footballer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"theme" text DEFAULT 'standard' NOT NULL,
	"status" "daily_challenge_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "challenge_items" ADD CONSTRAINT "challenge_items_daily_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("daily_challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_items" ADD CONSTRAINT "challenge_items_footballer_id_footballers_id_fk" FOREIGN KEY ("footballer_id") REFERENCES "public"."footballers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_items_daily_challenge_id_position_key" ON "challenge_items" USING btree ("daily_challenge_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_challenges_date_key" ON "daily_challenges" USING btree ("date");