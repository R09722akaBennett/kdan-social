ALTER TYPE "public"."task_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "onboarding_dismissed_at" timestamp with time zone;