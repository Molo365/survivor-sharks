import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const siteSettingsTable = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  maintenanceEnabled: boolean("maintenance_enabled").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
});

export const insertSiteSettingsSchema = createInsertSchema(siteSettingsTable);
export type InsertSiteSettings = z.infer<typeof insertSiteSettingsSchema>;
export type SiteSettings = typeof siteSettingsTable.$inferSelect;