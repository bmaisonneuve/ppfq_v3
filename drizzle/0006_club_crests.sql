CREATE TABLE "club_crests" (
	"key" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"source_file" text,
	"source_url" text,
	"source_wiki" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "crest_key" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_crest_key_club_crests_key_fk" FOREIGN KEY ("crest_key") REFERENCES "public"."club_crests"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clubs_crest_key_idx" ON "clubs" USING btree ("crest_key");