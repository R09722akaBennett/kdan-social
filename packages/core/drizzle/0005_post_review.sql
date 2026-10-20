CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
-- Same reason as 0002: keep the new table away from Supabase's Data API.
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Older posts recorded their author only in the audit log.
UPDATE "posts" p SET "created_by" = l."actor"
FROM "audit_log" l WHERE l."action" = 'post.created' AND l."target" = p."id"::text;
