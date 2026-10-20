CREATE TABLE "account_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"permalink" text,
	"media_type" text,
	"engagements" integer,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_posts" ADD CONSTRAINT "account_posts_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_posts_account_external" ON "account_posts" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "account_posts_published" ON "account_posts" USING btree ("published_at");--> statement-breakpoint
-- Same reason as 0002: keep the new table away from Supabase's Data API.
ALTER TABLE "account_posts" ENABLE ROW LEVEL SECURITY;
