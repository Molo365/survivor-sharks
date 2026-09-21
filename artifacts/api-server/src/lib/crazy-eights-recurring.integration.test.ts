import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  crazyEightsPeriodResultsTable,
  db,
  entriesTable,
  poolsTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { declareCrazyEightsWinners, resolveCrazyEightsPeriod } from "./auto-eliminator";

test("recurring NHL periods record and advance while non-recurring NHL pools close", async (t) => {
  const tableCheck = await db.execute(sql<{ exists: boolean }>`
    SELECT to_regclass('public.crazy_eights_period_results') IS NOT NULL AS "exists"
  `);
  if (!tableCheck.rows[0]?.exists) {
    t.skip("0015_crazy_eights_period_results.sql has not been applied");
    return;
  }

  const suffix = `crazy-eights-recurring-${crypto.randomUUID()}`;
  const userIds: number[] = [];
  const poolIds: number[] = [];

  try {
    const users = await db.insert(usersTable).values([
      { username: `${suffix}-one`, email: `${suffix}-one@example.test`, passwordHash: "x" },
      { username: `${suffix}-two`, email: `${suffix}-two@example.test`, passwordHash: "x" },
    ]).returning();
    userIds.push(...users.map((user) => user.id));

    const pools = await db.insert(poolsTable).values([
      {
        name: `${suffix}-recurring`,
        inviteCode: `${suffix}-r`,
        commissionerId: users[0].id,
        poolType: "crazy_8s",
        sport: "nhl",
        isRecurring: true,
        sandboxMode: false,
        currentWeek: 4,
        prizeStructure: [{ place: 1, amount: 60 }, { place: 2, amount: 40 }],
      },
      {
        name: `${suffix}-final`,
        inviteCode: `${suffix}-f`,
        commissionerId: users[0].id,
        poolType: "crazy_8s",
        sport: "nhl",
        isRecurring: false,
        sandboxMode: false,
        currentWeek: 4,
        prizeStructure: [{ place: 1, amount: 60 }, { place: 2, amount: 40 }],
      },
      {
        name: `${suffix}-manual-end`,
        inviteCode: `${suffix}-m`,
        commissionerId: users[0].id,
        poolType: "crazy_8s",
        sport: "nhl",
        isRecurring: true,
        sandboxMode: false,
        currentWeek: 4,
        prizeStructure: [{ place: 1, amount: 60 }, { place: 2, amount: 40 }],
      },
      {
        name: `${suffix}-post-rollover-end`,
        inviteCode: `${suffix}-p`,
        commissionerId: users[0].id,
        poolType: "crazy_8s",
        sport: "nhl",
        isRecurring: true,
        sandboxMode: false,
        currentWeek: 4,
        prizeStructure: [{ place: 1, amount: 60 }, { place: 2, amount: 40 }],
      },
    ]).returning();
    poolIds.push(...pools.map((pool) => pool.id));
    const [recurringPool, finalPool, manualEndPool, postRolloverEndPool] = pools;

    await db.insert(entriesTable).values(pools.flatMap((pool) => users.map((user, index) => ({
      poolId: pool.id,
      userId: user.id,
      tiebreakerShotsOnGoal: 60 + index,
      tiebreakerPenaltyMinutes: 20 + index,
      tiebreakerPoints: 210 + index,
      tiebreakerThrees: 25 + index,
    }))));

    await Promise.all([
      declareCrazyEightsWinners(
        recurringPool,
        [[users[0].id], [users[1].id]],
        "outright winner",
      ),
      declareCrazyEightsWinners(
        recurringPool,
        [[users[0].id], [users[1].id]],
        "outright winner",
      ),
    ]);

    const [advancedPool] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, recurringPool.id));
    assert.equal(advancedPool.currentWeek, 5);
    assert.equal(advancedPool.isActive, true);
    assert.equal(advancedPool.endedAt, null);
    assert.equal(advancedPool.closureReason, null);

    const recurringEntries = await db.select().from(entriesTable)
      .where(eq(entriesTable.poolId, recurringPool.id));
    for (const entry of recurringEntries) {
      assert.equal(entry.tiebreakerShotsOnGoal, null);
      assert.equal(entry.tiebreakerPenaltyMinutes, null);
      assert.equal(entry.tiebreakerPoints, null);
      assert.equal(entry.tiebreakerThrees, null);
      assert.equal(entry.finalWinner, false);
      assert.equal(entry.finishPosition, null);
      assert.equal(entry.prizeAmount, null);
    }

    const periodResults = await db.select().from(crazyEightsPeriodResultsTable)
      .where(eq(crazyEightsPeriodResultsTable.poolId, recurringPool.id));
    assert.equal(periodResults.length, 1);
    assert.equal(periodResults[0].week, 4);
    assert.equal(periodResults[0].reason, "outright winner");
    assert.deepEqual(periodResults[0].groups.map((group) => group.userIds), [
      [users[0].id],
      [users[1].id],
    ]);

    await db.update(poolsTable)
      .set({ isRecurring: false })
      .where(eq(poolsTable.id, manualEndPool.id));
    await declareCrazyEightsWinners(
      manualEndPool,
      [[users[0].id], [users[1].id]],
      "outright winner",
    );
    const [manualEndBeforeFinalPoll] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, manualEndPool.id));
    assert.equal(manualEndBeforeFinalPoll.currentWeek, 4);
    assert.equal(manualEndBeforeFinalPoll.isActive, true);
    const manualEndResults = await db.select().from(crazyEightsPeriodResultsTable)
      .where(eq(crazyEightsPeriodResultsTable.poolId, manualEndPool.id));
    assert.equal(manualEndResults.length, 0);

    await declareCrazyEightsWinners(
      manualEndBeforeFinalPoll,
      [[users[0].id], [users[1].id]],
      "outright winner",
    );
    const [manualEndClosed] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, manualEndPool.id));
    assert.equal(manualEndClosed.currentWeek, 4);
    assert.equal(manualEndClosed.isActive, false);

    await declareCrazyEightsWinners(
      postRolloverEndPool,
      [[users[0].id], [users[1].id]],
      "outright winner",
    );
    await db.update(poolsTable)
      .set({ isRecurring: false })
      .where(eq(poolsTable.id, postRolloverEndPool.id));
    const [postRolloverManualEnd] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, postRolloverEndPool.id));
    await resolveCrazyEightsPeriod(postRolloverManualEnd, [], []);
    const [postRolloverClosed] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, postRolloverEndPool.id));
    assert.equal(postRolloverClosed.currentWeek, 5);
    assert.equal(postRolloverClosed.isActive, false);

    await declareCrazyEightsWinners(
      finalPool,
      [[users[0].id], [users[1].id]],
      "outright winner",
    );
    const [closedPool] = await db.select().from(poolsTable)
      .where(eq(poolsTable.id, finalPool.id));
    assert.equal(closedPool.currentWeek, 4);
    assert.equal(closedPool.isActive, false);
    assert.ok(closedPool.endedAt);
    const finalEntries = await db.select().from(entriesTable)
      .where(eq(entriesTable.poolId, finalPool.id));
    assert.equal(finalEntries.find((entry) => entry.userId === users[0].id)?.finalWinner, true);
  } finally {
    if (poolIds.length > 0) await db.delete(poolsTable).where(inArray(poolsTable.id, poolIds));
    if (userIds.length > 0) await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
});
