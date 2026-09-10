CREATE TYPE "public"."play_mode" AS ENUM('daily', 'archive');--> statement-breakpoint
CREATE TYPE "public"."play_status" AS ENUM('in_progress', 'solved', 'failed');--> statement-breakpoint
CREATE TABLE "player_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_item_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"mode" "play_mode" NOT NULL,
	"tries_used" integer DEFAULT 0 NOT NULL,
	"status" "play_status" DEFAULT 'in_progress' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"last_guess_footballer_id" uuid,
	"last_guess_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cookie_id" text NOT NULL,
	"auth_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_challenge_item_id_challenge_items_id_fk" FOREIGN KEY ("challenge_item_id") REFERENCES "public"."challenge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_last_guess_footballer_id_footballers_id_fk" FOREIGN KEY ("last_guess_footballer_id") REFERENCES "public"."footballers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_progress_challenge_item_id_player_id_key" ON "player_progress" USING btree ("challenge_item_id","player_id");--> statement-breakpoint
CREATE INDEX "player_progress_player_id_opened_at_idx" ON "player_progress" USING btree ("player_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "players_cookie_id_key" ON "players" USING btree ("cookie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_auth_user_id_key" ON "players" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "players_last_seen_at_idx" ON "players" USING btree ("last_seen_at");