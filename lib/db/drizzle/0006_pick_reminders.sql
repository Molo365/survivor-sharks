ALTER TABLE "users" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TYPE "public"."pick_reminder_stage" AS ENUM('24h', 'final');
--> statement-breakpoint
CREATE TYPE "public"."pick_reminder_status" AS ENUM('sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_reminders" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "period_key" text NOT NULL,
  "reminder_stage" "pick_reminder_stage" NOT NULL,
  "status" "pick_reminder_status",
  "sent_at" timestamp with time zone,
  "provider_message_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pick_reminders_user_pool_period_stage_uniq" UNIQUE("user_id","pool_id","period_key","reminder_stage")
);
--> statement-breakpoint
ALTER TABLE "pick_reminders" ADD CONSTRAINT "pick_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_reminders" ADD CONSTRAINT "pick_reminders_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;