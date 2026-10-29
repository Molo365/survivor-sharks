CREATE TABLE IF NOT EXISTS "weekly_pick_em_entry_paid" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_pick_em_period_paid" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool_id" integer NOT NULL,
	"period_key" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_pick_em_entry_paid" ADD CONSTRAINT "weekly_pick_em_entry_paid_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_pick_em_entry_paid" ADD CONSTRAINT "weekly_pick_em_entry_paid_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_pick_em_period_paid" ADD CONSTRAINT "weekly_pick_em_period_paid_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_pick_em_entry_paid_pool_user" ON "weekly_pick_em_entry_paid" USING btree ("pool_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_pick_em_period_paid_pool_period" ON "weekly_pick_em_period_paid" USING btree ("pool_id","period_key");
