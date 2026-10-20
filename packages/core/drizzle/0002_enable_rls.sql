-- Supabase serves every table in `public` through its Data API to anyone holding the
-- publishable key. RLS on with no policies denies that API everything; the app connects
-- as the database owner, which RLS does not restrict.
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meta_connect_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "markets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connected_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publish_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "follower_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
