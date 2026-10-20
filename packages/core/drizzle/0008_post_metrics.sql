CREATE TABLE "post_metrics" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"engagements" integer,
	"opens" integer,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_task_id_publish_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."publish_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same reason as 0002: keep the new table away from Supabase's Data API.
ALTER TABLE "post_metrics" ENABLE ROW LEVEL SECURITY;
