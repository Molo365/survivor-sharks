import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, entriesTable, pickemPicksTable, pickRemindersTable, picksTable, poolsTable, usersTable } from "@workspace/db";
import { getTodayEtDate } from "./espn";
import { runPickReminders, type ReminderResolution } from "./pick-reminders";

const suffix = `reminder-it-${crypto.randomUUID()}`;
const now = new Date("2025-09-06T17:00:00Z");
const deadline = new Date(now.getTime() + 4 * 60 * 60_000);
const today = getTodayEtDate();

test("development DB reminder orchestration claims sandbox fixture pools once", async () => {
  const userIds: number[] = [], poolIds: number[] = [];
  try {
    const users = await db.insert(usersTable).values([
      { username: `${suffix}-target`, email: `${suffix}-target@example.test`, passwordHash: "x", emailVerifiedAt: now },
      { username: `${suffix}-complete`, email: `${suffix}-complete@example.test`, passwordHash: "x", emailVerifiedAt: now },
      { username: `${suffix}-optout`, email: `${suffix}-optout@example.test`, passwordHash: "x", emailVerifiedAt: now, remindersEnabled: false },
      { username: `${suffix}-unverified`, email: `${suffix}-unverified@example.test`, passwordHash: "x" },
      { username: `${suffix}-eliminated`, email: `${suffix}-eliminated@example.test`, passwordHash: "x", emailVerifiedAt: now },
    ]).returning();
    userIds.push(...users.map((user) => user.id));
    const target = users[0]!, complete = users[1]!, eliminated = users[4]!;
    const fixtures = [
      ["pickem", "daily", "mlb"], ["pickem", "weekly", "nfl"], ["season", "weekly", "nfl"],
      ["nfl_confidence", "weekly", "nfl"], ["nfl_confidence_weekly", "weekly", "nfl"], ["nba_ats", "weekly", "nba"],
    ] as const;
    const pools = await db.insert(poolsTable).values(fixtures.map(([poolType, pickFrequency, sport], index) => ({
      name: `${suffix}-${poolType}-${index}`, inviteCode: `${suffix}-${index}`, commissionerId: target.id,
      poolType, pickFrequency, sport, sandboxMode: true, isRecurring: true, season: 2025, currentWeek: 1,
    }))).returning();
    poolIds.push(...pools.map((pool) => pool.id));
    const entries = await db.insert(entriesTable).values(pools.flatMap((pool) => users
      .filter((user) => user.id !== eliminated.id || pool.poolType === "season")
      .map((user) => ({
      poolId: pool.id, userId: user.id, status: pool.poolType === "season" && user.id === eliminated.id ? "eliminated" as const : "alive" as const,
    })))).returning();
    const entryFor = (poolId: number, userId: number) => entries.find((entry) => entry.poolId === poolId && entry.userId === userId)!;
    for (const pool of pools) {
      if (pool.poolType === "season") {
        await db.insert(picksTable).values({ poolId: pool.id, userId: complete.id, entryId: entryFor(pool.id, complete.id).id, week: 1, pickDate: pool.pickFrequency === "daily" ? today : null, teamId: "team", teamName: "Team" });
      } else {
        await db.insert(pickemPicksTable).values({ poolId: pool.id, userId: complete.id, gameId: `fixture-${pool.id}`, gameDate: today, week: 1, pickedTeamId: "team", pickedTeamName: "Team", confidencePoints: pool.poolType.includes("confidence") ? 1 : null });
      }
    }
    const resolver = async (pool: typeof poolsTable.$inferSelect): Promise<ReminderResolution> => {
      const gameId = `fixture-${pool.id}`;
      if (pool.poolType === "season") return { deadline, periodKey: "2025-week-1", context: {} };
      if (pool.poolType.includes("confidence")) return { deadline, periodKey: "2025-week-1", context: { nflGameIds: new Set([gameId]) } };
      const period = pool.pickFrequency === "daily"
        ? { kind: "date" as const, date: today, games: [], gameIds: new Set([gameId]), confidenceRequired: false }
        : { kind: "week" as const, games: [], gameIds: new Set([gameId]), confidenceRequired: false };
      return { deadline, periodKey: pool.pickFrequency === "daily" ? today : `2025-09-01/2025-09-07`, context: { period } };
    };
    const sender = async (_email: string, poolName: string) => {
      if (poolName.includes("nba_ats")) throw new Error("intentional fake provider failure");
      return "fake-provider-id";
    };
    const first = await runPickReminders({ now, poolIds, includeSandbox: true, resolver, sender: sender as never });
    assert.deepEqual(first, { claimed: 6, sent: 5, failed: 1 });
    const second = await runPickReminders({ now, poolIds, includeSandbox: true, resolver, sender: sender as never });
    assert.deepEqual(second, { claimed: 0, sent: 0, failed: 0 });
    const rows = await db.select().from(pickRemindersTable).where(inArray(pickRemindersTable.poolId, poolIds));
    assert.equal(rows.length, 6);
    assert.equal(rows.filter((row) => row.status === "sent" && row.providerMessageId === "fake-provider-id").length, 5);
    assert.equal(rows.filter((row) => row.status === "failed").length, 1);
    assert.equal(rows.some((row) => row.userId !== target.id), false);
  } finally {
    if (poolIds.length) await db.delete(poolsTable).where(inArray(poolsTable.id, poolIds));
    if (userIds.length) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});