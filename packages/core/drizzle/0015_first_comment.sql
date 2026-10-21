ALTER TABLE "posts" ADD COLUMN "first_comment" text;--> statement-breakpoint
ALTER TABLE "publish_tasks" ADD COLUMN "comment_id" text;--> statement-breakpoint
ALTER TABLE "publish_tasks" ADD COLUMN "comment_error" text;