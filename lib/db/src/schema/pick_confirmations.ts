import { pgTable, text, serial, timestamp, integer, pgEnum, uuid, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { poolsTable } from "./pools";

export const pickConfirmationDeliveryStatusEnum = pgEnum("pick_confirmation_delivery_status", ["pending", "sent", "failed"]);

export const pickConfirmationsTable = pgTable("pick_confirmations", {
  id: serial("id").primaryKey(),
  confirmationId: uuid("confirmation_id").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  poolId: integer("pool_id").notNull().references(() => poolsTable.id, { onDelete: "cascade" }),
  poolType: text("pool_type").notNull(),
  sport: text("sport").notNull(),
  periodKey: text("period_key").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  deliveryStatus: pickConfirmationDeliveryStatusEnum("delivery_status").notNull().default("pending"),
  providerMessageId: text("provider_message_id"),
  failureReason: text("failure_reason"),
  picksSnapshot: jsonb("picks_snapshot").notNull(),
}, (t) => [unique("pick_confirmations_confirmation_id_uniq").on(t.confirmationId)]);

export const insertPickConfirmationSchema = createInsertSchema(pickConfirmationsTable).omit({ id: true });
export type InsertPickConfirmation = z.infer<typeof insertPickConfirmationSchema>;
export type PickConfirmation = typeof pickConfirmationsTable.$inferSelect;