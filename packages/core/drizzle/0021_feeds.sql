CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"summary" text DEFAULT '' NOT NULL,
	"image_url" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"site_url" text,
	"created_by" text NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_feed_key" ON "feed_items" USING btree ("feed_id","key");--> statement-breakpoint
CREATE INDEX "feed_items_recent" ON "feed_items" USING btree ("feed_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feeds_workspace_url" ON "feeds" USING btree ("workspace_id","url");--> statement-breakpoint
ALTER TABLE "feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feed_items" ENABLE ROW LEVEL SECURITY;