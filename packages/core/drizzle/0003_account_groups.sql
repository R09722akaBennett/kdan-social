CREATE TABLE "account_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "post_variants" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "time_zone" text DEFAULT 'Asia/Taipei' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "requires_review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_workspace_name" ON "account_groups" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_variants" ADD CONSTRAINT "post_variants_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Same reason as 0002: keep the new table away from Supabase's Data API.
ALTER TABLE "account_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Markets become customer-named groups. Each keeps its id so accounts can be pointed at
-- it directly, and its time zone moves onto the accounts that were in it.
INSERT INTO "account_groups" ("id", "workspace_id", "name", "created_at")
SELECT "id", "workspace_id", "name", "created_at" FROM "markets";--> statement-breakpoint
UPDATE "connected_accounts" a SET "group_id" = m."id", "time_zone" = m."time_zone"
FROM "markets" m WHERE m."id" = a."market_id";--> statement-breakpoint
UPDATE "workspaces" w SET "requires_review" = coalesce((SELECT bool_or(m."requires_review") FROM "markets" m WHERE m."workspace_id" = w."id"), true);--> statement-breakpoint
-- The old key allowed one variant per market and platform, which the split below breaks.
DROP INDEX "variants_post_market_platform";--> statement-breakpoint
-- A variant was shared by every account of one market and platform; now each account
-- has its own so it can carry its own text. The first task keeps the existing variant,
-- and every other task gets a copy whose id is the task's own, which cannot collide.
UPDATE "post_variants" v SET "account_id" = r."account_id"
FROM (SELECT "variant_id", "account_id", row_number() OVER (PARTITION BY "variant_id" ORDER BY "created_at", "id") AS rn FROM "publish_tasks") r
WHERE r."variant_id" = v."id" AND r.rn = 1;--> statement-breakpoint
INSERT INTO "post_variants" ("id", "post_id", "market_id", "account_id", "platform", "body", "media", "review_status", "created_at")
SELECT r."id", v."post_id", v."market_id", r."account_id", v."platform", v."body", v."media", v."review_status", v."created_at"
FROM (SELECT "id", "variant_id", "account_id", row_number() OVER (PARTITION BY "variant_id" ORDER BY "created_at", "id") AS rn FROM "publish_tasks") r
JOIN "post_variants" v ON v."id" = r."variant_id"
WHERE r.rn > 1;--> statement-breakpoint
UPDATE "publish_tasks" t SET "variant_id" = t."id"
FROM (SELECT "id", row_number() OVER (PARTITION BY "variant_id" ORDER BY "created_at", "id") AS rn FROM "publish_tasks") r
WHERE r."id" = t."id" AND r.rn > 1;--> statement-breakpoint
-- Variants that never got a task have no account to belong to.
DELETE FROM "post_variants" WHERE "account_id" IS NULL;
