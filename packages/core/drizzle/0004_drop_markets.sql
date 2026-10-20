-- Reordered by hand: drizzle-kit dropped the table first, whose CASCADE already removes
-- the foreign keys that the next statements then fail to find.
ALTER TABLE "connected_accounts" DROP CONSTRAINT "connected_accounts_market_id_markets_id_fk";
--> statement-breakpoint
ALTER TABLE "post_variants" DROP CONSTRAINT "post_variants_market_id_markets_id_fk";
--> statement-breakpoint
ALTER TABLE "connected_accounts" ALTER COLUMN "time_zone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post_variants" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_post_account" ON "post_variants" USING btree ("post_id","account_id");--> statement-breakpoint
ALTER TABLE "connected_accounts" DROP COLUMN "market_id";--> statement-breakpoint
ALTER TABLE "post_variants" DROP COLUMN "market_id";--> statement-breakpoint
DROP TABLE "markets";
