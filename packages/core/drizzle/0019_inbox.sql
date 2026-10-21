CREATE TYPE "public"."inbox_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TABLE "inbox_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"post_external_id" text NOT NULL,
	"parent_external_id" text,
	"author" text NOT NULL,
	"text" text NOT NULL,
	"commented_at" timestamp with time zone NOT NULL,
	"status" "inbox_status" DEFAULT 'open' NOT NULL,
	"reply_external_id" text,
	"reply_text" text,
	"replied_by" text,
	"replied_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_comments" ADD CONSTRAINT "inbox_comments_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_account_external" ON "inbox_comments" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "inbox_queue" ON "inbox_comments" USING btree ("account_id","status","commented_at");--> statement-breakpoint
ALTER TABLE "inbox_comments" ENABLE ROW LEVEL SECURITY;