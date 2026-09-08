CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;CREATE TYPE "public"."pick_confirmation_delivery_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "pick_confirmations" (
  "id" serial PRIMARY KEY NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "pool_id" integer NOT NULL,
  "pool_type" text NOT NULL,
  "sport" text NOT NULL,
  "period_key" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "recipient_email" text NOT NULL,
  "delivery_status" "pick_confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
  "provider_message_id" text,
  "failure_reason" text,
  "picks_snapshot" jsonb NOT NULL,
  CONSTRAINT "pick_confirmations_confirmation_id_uniq" UNIQUE("confirmation_id")
);
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pick_confirmations" ADD CONSTRAINT "pick_confirmations_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;