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
  /** userId → weeks collected; missing user = 0 weeks. */
  entryWeeksCollectedByUser: Map<number, number>;
  /** Row exists with weeks_collected NULL (old “mark all paid” toggle). */
  entryLegacyFullPaidUserIds: Set<number>;
};

export type WeeklyPickEmCommissionerLedgerPatch = {
  entryPaid?: { userId: number; paid: boolean };
  /** Per-week entry collection (Hit the Ice / Fast Break recurring). */
  entryWeeksCollected?: { userId: number; weeksCollected: number };
  periodPaid?: { periodKey: string; paid: boolean };
  /** One-time merge from client localStorage (union into DB). */
  mergeDeviceState?: { entryUserIds?: number[]; periodKeys?: string[] };
};

export function resolveEntryWeeksCollected(
  userId: number,
  completedWeekCount: number,
  flags: WeeklyPickEmCommissionerPaidFlags,
): number {
  if (completedWeekCount <= 0) return 0;
  if (flags.entryLegacyFullPaidUserIds.has(userId)) return completedWeekCount;
  const n = flags.entryWeeksCollectedByUser.get(userId);
  if (n == null) return 0;
  return Math.min(Math.max(0, n), completedWeekCount);
}

export async function loadWeeklyPickEmCommissionerPaidFlags(
  poolId: number,
): Promise<WeeklyPickEmCommissionerPaidFlags> {
  const [entryRows, periodRows] = await Promise.all([
    db
      .select({
        userId: weeklyPickEmEntryPaidTable.userId,
        weeksCollected: weeklyPickEmEntryPaidTable.weeksCollected,
      })
      .from(weeklyPickEmEntryPaidTable)
      .where(eq(weeklyPickEmEntryPaidTable.poolId, poolId)),
    db
      .select({ periodKey: weeklyPickEmPeriodPaidTable.periodKey })
      .from(weeklyPickEmPeriodPaidTable)
      .where(eq(weeklyPickEmPeriodPaidTable.poolId, poolId)),
  ]);

  const entryWeeksCollectedByUser = new Map<number, number>();
  const entryLegacyFullPaidUserIds = new Set<number>();
  const entryPaidUserIds = new Set<number>();

  for (const row of entryRows) {
    entryPaidUserIds.add(row.userId);
    if (row.weeksCollected == null) {
      entryLegacyFullPaidUserIds.add(row.userId);
    } else {
      entryWeeksCollectedByUser.set(row.userId, row.weeksCollected);
    }
  }

  return {
    entryPaidUserIds,
    periodPaidKeys: new Set(periodRows.map((r) => r.periodKey)),
    entryWeeksCollectedByUser,
    entryLegacyFullPaidUserIds,
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
  opts?: { maxEntryWeeks?: number },
): Promise<void> {
  const maxWeeks = opts?.maxEntryWeeks;

  if (patch.mergeDeviceState) {
    const members = await poolMemberUserIds(poolId);
    const entryIds = (patch.mergeDeviceState.entryUserIds ?? []).filter((id) => members.has(id));
    if (entryIds.length > 0) {
      await db
        .insert(weeklyPickEmEntryPaidTable)
        .values(entryIds.map((userId) => ({ poolId, userId, weeksCollected: null })))
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

  if (patch.entryWeeksCollected) {
    const { userId, weeksCollected } = patch.entryWeeksCollected;
    const members = await poolMemberUserIds(poolId);
    if (!members.has(userId)) {
      throw new Error("User is not in this pool");
    }
    const cap = maxWeeks ?? weeksCollected;
    const clamped = Math.min(Math.max(0, weeksCollected), Math.max(0, cap));
    if (clamped <= 0) {
      await db
        .delete(weeklyPickEmEntryPaidTable)
        .where(
          and(
            eq(weeklyPickEmEntryPaidTable.poolId, poolId),
            eq(weeklyPickEmEntryPaidTable.userId, userId),
          ),
        );
    } else if (maxWeeks != null && clamped >= maxWeeks) {
      await db
        .insert(weeklyPickEmEntryPaidTable)
        .values({ poolId, userId, weeksCollected: maxWeeks })
        .onConflictDoUpdate({
          target: [weeklyPickEmEntryPaidTable.poolId, weeklyPickEmEntryPaidTable.userId],
          set: { weeksCollected: maxWeeks },
        });
    } else {
      await db
        .insert(weeklyPickEmEntryPaidTable)
        .values({ poolId, userId, weeksCollected: clamped })
        .onConflictDoUpdate({
          target: [weeklyPickEmEntryPaidTable.poolId, weeklyPickEmEntryPaidTable.userId],
          set: { weeksCollected: clamped },
        });
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
        .values({
          poolId,
          userId,
          weeksCollected: maxWeeks != null && maxWeeks > 0 ? maxWeeks : null,
        })
        .onConflictDoUpdate({
          target: [weeklyPickEmEntryPaidTable.poolId, weeklyPickEmEntryPaidTable.userId],
          set: {
            weeksCollected: maxWeeks != null && maxWeeks > 0 ? maxWeeks : null,
          },
        });
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
