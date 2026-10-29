import { db } from "@workspace/db";
import {
  entriesTable,
  weeklyPickEmEntryPaidTable,
  weeklyPickEmPeriodPaidTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type WeeklyPickEmCommissionerPaidFlags = {
  entryPaidUserIds: Set<number>;
  periodPaidKeys: Set<string>;
};

export type WeeklyPickEmCommissionerLedgerPatch = {
  entryPaid?: { userId: number; paid: boolean };
  periodPaid?: { periodKey: string; paid: boolean };
  /** One-time merge from client localStorage (union into DB). */
  mergeDeviceState?: { entryUserIds?: number[]; periodKeys?: string[] };
};

export async function loadWeeklyPickEmCommissionerPaidFlags(
  poolId: number,
): Promise<WeeklyPickEmCommissionerPaidFlags> {
  const [entryRows, periodRows] = await Promise.all([
    db
      .select({ userId: weeklyPickEmEntryPaidTable.userId })
      .from(weeklyPickEmEntryPaidTable)
      .where(eq(weeklyPickEmEntryPaidTable.poolId, poolId)),
    db
      .select({ periodKey: weeklyPickEmPeriodPaidTable.periodKey })
      .from(weeklyPickEmPeriodPaidTable)
      .where(eq(weeklyPickEmPeriodPaidTable.poolId, poolId)),
  ]);

  return {
    entryPaidUserIds: new Set(entryRows.map((r) => r.userId)),
    periodPaidKeys: new Set(periodRows.map((r) => r.periodKey)),
  };
}

async function poolMemberUserIds(poolId: number): Promise<Set<number>> {
  const rows = await db
    .select({ userId: entriesTable.userId })
    .from(entriesTable)
    .where(eq(entriesTable.poolId, poolId));
  return new Set(rows.map((r) => r.userId));
}

export async function applyWeeklyPickEmCommissionerLedgerPatch(
  poolId: number,
  patch: WeeklyPickEmCommissionerLedgerPatch,
): Promise<void> {
  if (patch.mergeDeviceState) {
    const members = await poolMemberUserIds(poolId);
    const entryIds = (patch.mergeDeviceState.entryUserIds ?? []).filter((id) => members.has(id));
    if (entryIds.length > 0) {
      await db
        .insert(weeklyPickEmEntryPaidTable)
        .values(entryIds.map((userId) => ({ poolId, userId })))
        .onConflictDoNothing();
    }
    const periodKeys = patch.mergeDeviceState.periodKeys ?? [];
    if (periodKeys.length > 0) {
      await db
        .insert(weeklyPickEmPeriodPaidTable)
        .values(periodKeys.map((periodKey) => ({ poolId, periodKey })))
        .onConflictDoNothing();
    }
  }

  if (patch.entryPaid) {
    const { userId, paid } = patch.entryPaid;
    const members = await poolMemberUserIds(poolId);
    if (!members.has(userId)) {
      throw new Error("User is not in this pool");
    }
    if (paid) {
      await db
        .insert(weeklyPickEmEntryPaidTable)
        .values({ poolId, userId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(weeklyPickEmEntryPaidTable)
        .where(
          and(
            eq(weeklyPickEmEntryPaidTable.poolId, poolId),
            eq(weeklyPickEmEntryPaidTable.userId, userId),
          ),
        );
    }
  }

  if (patch.periodPaid) {
    const { periodKey, paid } = patch.periodPaid;
    if (!periodKey.trim()) {
      throw new Error("Invalid period key");
    }
    if (paid) {
      await db
        .insert(weeklyPickEmPeriodPaidTable)
        .values({ poolId, periodKey })
        .onConflictDoNothing();
    } else {
      await db
        .delete(weeklyPickEmPeriodPaidTable)
        .where(
          and(
            eq(weeklyPickEmPeriodPaidTable.poolId, poolId),
            eq(weeklyPickEmPeriodPaidTable.periodKey, periodKey),
          ),
        );
    }
  }
}
