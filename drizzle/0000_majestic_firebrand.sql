CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wikidata_qid" text,
	"fr_name" text NOT NULL,
	"en_name" text,
	"logo_s3_key" text
);
--> statement-breakpoint
CREATE TABLE "footballers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wikidata_qid" text,
	"name" text NOT NULL,
	"wiki_fr_url" text,
	"wiki_en_url" text,
	"sitelinks" integer DEFAULT 0 NOT NULL,
	"nationality_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nationalities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"fr_name" text NOT NULL,
	"en_name" text,
	"flag_s3_key" text
);
--> statement-breakpoint
CREATE TABLE "player_clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"footballer_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"is_loan" boolean DEFAULT false NOT NULL,
	"start_year" integer NOT NULL,
	"end_year" integer,
	"matches" integer,
	"goals" integer
);
--> statement-breakpoint
ALTER TABLE "footballers" ADD CONSTRAINT "footballers_nationality_id_nationalities_id_fk" FOREIGN KEY ("nationality_id") REFERENCES "public"."nationalities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_footballer_id_footballers_id_fk" FOREIGN KEY ("footballer_id") REFERENCES "public"."footballers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_clubs" ADD CONSTRAINT "player_clubs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_wikidata_qid_key" ON "clubs" USING btree ("wikidata_qid");--> statement-breakpoint
CREATE UNIQUE INDEX "footballers_wikidata_qid_key" ON "footballers" USING btree ("wikidata_qid");--> statement-breakpoint
CREATE INDEX "footballers_sitelinks_idx" ON "footballers" USING btree ("sitelinks" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "footballers_nationality_id_idx" ON "footballers" USING btree ("nationality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nationalities_code_key" ON "nationalities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "player_clubs_career_idx" ON "player_clubs" USING btree ("footballer_id","start_year","end_year");