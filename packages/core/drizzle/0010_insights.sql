CREATE TABLE "account_daily_metrics" (
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_daily_metrics_account_id_day_pk" PRIMARY KEY("account_id","day")
);
--> statement-breakpoint
CREATE TABLE "audience_breakdowns" (
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_breakdowns_account_id_kind_pk" PRIMARY KEY("account_id","kind")
);
--> statement-breakpoint
ALTER TABLE "account_posts" ADD COLUMN "reach" integer;--> statement-breakpoint
ALTER TABLE "account_posts" ADD COLUMN "views" integer;--> statement-breakpoint
ALTER TABLE "account_posts" ADD COLUMN "insights" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD COLUMN "reach" integer;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD COLUMN "views" integer;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD COLUMN "insights" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "account_daily_metrics" ADD CONSTRAINT "account_daily_metrics_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_breakdowns" ADD CONSTRAINT "audience_breakdowns_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same reason as 0002: keep the new tables away from Supabase's Data API.
ALTER TABLE "account_daily_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audience_breakdowns" ENABLE ROW LEVEL SECURITY;
