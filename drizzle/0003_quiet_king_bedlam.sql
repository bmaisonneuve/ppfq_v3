CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"target" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items" integer,
	"errors" integer,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs" USING btree ("job","started_at" DESC NULLS LAST);