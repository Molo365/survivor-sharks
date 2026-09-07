CREATE TABLE IF NOT EXISTS "site_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "maintenance_enabled" boolean DEFAULT false NOT NULL,
  "maintenance_message" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "site_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "site_settings" ("id", "maintenance_enabled")
VALUES (1, false)
ON CONFLICT ("id") DO NOTHING;