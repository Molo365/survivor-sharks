CREATE TABLE IF NOT EXISTS "multiplier_lines_notify" (
  "pool_id" integer NOT NULL,
  "week" integer NOT NULL,
  "last_notified_lines_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "multiplier_lines_notify_pkey" PRIMARY KEY("pool_id","week")
);
--> statement-breakpoint
ALTER TABLE "multiplier_lines_notify" ADD CONSTRAINT "multiplier_lines_notify_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;