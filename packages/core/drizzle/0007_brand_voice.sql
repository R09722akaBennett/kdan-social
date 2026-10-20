CREATE TABLE "brand_voices" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"formality" integer DEFAULT 40 NOT NULL,
	"persuasion" integer DEFAULT 30 NOT NULL,
	"emoji" text DEFAULT 'few' NOT NULL,
	"banned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"glossary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_voices" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_voices" ADD CONSTRAINT "group_voices_group_id_account_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."account_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same reason as 0002: keep the new tables away from Supabase's Data API.
ALTER TABLE "brand_voices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "group_voices" ENABLE ROW LEVEL SECURITY;
