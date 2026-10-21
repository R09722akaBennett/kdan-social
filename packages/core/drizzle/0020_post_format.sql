CREATE TYPE "public"."post_format" AS ENUM('post', 'reel', 'story');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "format" "post_format" DEFAULT 'post' NOT NULL;