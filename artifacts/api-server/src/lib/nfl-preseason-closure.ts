import { db } from "@workspace/db";
import {
  entriesTable,
  pickemPicksTable,
  pickemSeasonWeekGameCountsTable,
  picksTable,
  poolsTable,
  weekResultsTable,
} from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import type { EspnGame } from "./espn";
import { validateNflPreseasonSlate } from "./nfl-auto-advance";

type Pool = typeof poolsTable.$inferSelect;

export interface NflPreseasonGradeResult {
  graded: number;
  eliminated: number;
  pendingCount: number;
}

export async function gradeNflPreseasonPoolWeek(
  pool: Pool,
  games: EspnGame[],
): Promise<NflPreseasonGradeResult> {
  const poolId = pool.id;
  const week = pool.currentWeek;
  const gameMap = new Map(games.map((game) => [game.id, game]));
  const winnerByGameId = new Map<string, string | null>();

  for (const game of games) {
    const winner = game.homeScore! > game.awayScore!
      ? game.homeTeam.id
      : game.awayScore! > game.homeScore!
        ? game.awayTeam.id
        : null;
    winnerByGameId.set(game.id, winner);
  }

  let graded = 0;
  let eliminated = 0;

  if (pool.poolType === "season") {
    const pendingPicks = await db
      .select()
      .from(picksTable)
      .where(and(
        eq(picksTable.poolId, poolId),
        eq(picksTable.week, week),
        eq(picksTable.result, "pending"),
      ));

    for (const pick of pendingPicks) {
      const game = games.find((candidate) =>
        candidate.homeTeam.id === pick.teamId || candidate.awayTeam.id === pick.teamId);
      if (!game) continue;

      const winner = winnerByGameId.get(game.id);
      const result = winner !== null && winner === pick.teamId ? "win" : "loss";
      const margin = game.homeTeam.id === pick.teamId
        ? game.homeScore! - game.awayScore!
        : game.awayScore! - game.homeScore!;

      await db
        .update(picksTable)
        .set({ result, marginOfVictory: margin })
        .where(and(eq(picksTable.id, pick.id), eq(picksTable.result, "pending")));
      graded++;

      if (result === "loss") {
        const updated = await db
          .update(entriesTable)
          .set({ status: "eliminated", eliminatedWeek: week, streak: 0 })
          .where(and(
            eq(entriesTable.poolId, poolId),
            eq(entriesTable.userId, pick.userId),
            eq(entriesTable.status, "alive"),
          ))
          .returning({ id: entriesTable.id });
        if (updated.length > 0) eliminated++;
      }
    }

    // A missing pick is a forfeit, matching the normal commissioner results
    // path. Only alive entries in this pool can be affected.
    const aliveEntries = await db
      .select({ id: entriesTable.id, userId: entriesTable.userId })
      .from(entriesTable)
      .where(and(eq(entriesTable.poolId, poolId), eq(entriesTable.status, "alive")));
    const currentWeekPicks = await db
      .select({ userId: picksTable.userId })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));
    const pickedUserIds = new Set(currentWeekPicks.map((pick) => pick.userId));

    for (const entry of aliveEntries) {
      if (pickedUserIds.has(entry.userId)) continue;
      const updated = await db
        .update(entriesTable)
        .set({ status: "eliminated", eliminatedWeek: week, streak: 0 })
        .where(and(eq(entriesTable.id, entry.id), eq(entriesTable.status, "alive")))
        .returning({ id: entriesTable.id });
      if (updated.length > 0) eliminated++;
    }

    const currentWeekPicksAfterGrading = await db
      .select({ teamId: picksTable.teamId, result: picksTable.result })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.week, week)));
    await db
      .insert(weekResultsTable)
      .values({
        poolId,
        week,
        losingTeamIds: currentWeekPicksAfterGrading
          .filter((pick) => pick.result === "loss")
          .map((pick) => pick.teamId),
        isVoided: false,
        processedBy: null,
      })
      .onConflictDoNothing();

    const [{ pendingCount }] = await db
      .select({ pendingCount: count() })
      .from(picksTable)
      .where(and(eq(picksTable.poolId, poolId), eq(picksTable.result, "pending")));
    return { graded, eliminated, pendingCount: Number(pendingCount) };
  }

  const pendingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, poolId),
      eq(pickemPicksTable.week, week),
      eq(pickemPicksTable.result, "pending"),
    ));

  for (const pick of pendingPicks) {
    const game = gameMap.get(pick.gameId);
    if (!game) continue;

    const winnerTeamId = winnerByGameId.get(game.id) ?? null;
    const result = winnerTeamId !== null && pick.pickedTeamId === winnerTeamId
      ? "correct"
      : "incorrect";
    await db
      .update(pickemPicksTable)
      .set({
        result,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        winnerTeamId,
      })
      .where(and(eq(pickemPicksTable.id, pick.id), eq(pickemPicksTable.result, "pending")));
    graded++;
  }

  await db
    .insert(pickemSeasonWeekGameCountsTable)
    .values({ poolId, week, gameCount: games.length })
    .onConflictDoUpdate({
      target: [pickemSeasonWeekGameCountsTable.poolId, pickemSeasonWeekGameCountsTable.week],
      set: { gameCount: games.length, recordedAt: new Date() },
    });

  const [{ pendingCount }] = await db
    .select({ pendingCount: count() })
    .from(pickemPicksTable)
    .where(and(eq(pickemPicksTable.poolId, poolId), eq(pickemPicksTable.result, "pending")));
  return { graded, eliminated, pendingCount: Number(pendingCount) };
}