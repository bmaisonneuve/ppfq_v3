CREATE TABLE "nationality_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"source_file" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nationalities" ADD COLUMN "flag_key" text;--> statement-breakpoint
ALTER TABLE "nationalities" ADD CONSTRAINT "nationalities_flag_key_nationality_flags_key_fk" FOREIGN KEY ("flag_key") REFERENCES "public"."nationality_flags"("key") ON DELETE set null ON UPDATE no action;