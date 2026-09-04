CREATE TABLE "mlb_bracket_slots" (
  "id" serial PRIMARY KEY NOT NULL, "pool_id" integer NOT NULL, "series_slot" text NOT NULL,
  "round" text NOT NULL, "fixed_team1" text, "fixed_team2" text,
  "feeder_slot_1" text, "feeder_slot_2" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mlb_bracket_slots_uniq" UNIQUE("pool_id","series_slot")
);
--> statement-breakpoint
ALTER TABLE "mlb_bracket_slots" ADD CONSTRAINT "mlb_bracket_slots_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE cascade;