import { db } from "@workspace/db";
import { pickemPicksTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  computeLiveCorrectAts,
  gradeNflPickemAtsPick,
  gradeNflPickemStraightPick,
  isNflPickemSeasonAts,
  type PickemScoringMode,
} from "./nfl-pickem-ats-cover";

export {
  computeLiveCorrectAts,
  gradeNflPickemAtsPick,
  gradeNflPickemStraightPick,
  isNflPickemSeasonAts,
  type PickemScoringMode,
};

export async function gradePickemSeasonPendingPicksForFinalGame(opts: {
  poolId: number;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  scoringMode: PickemScoringMode;
  spreadLine?: { spread: number; favoriteTeamId: string } | null;
  scoreFields?: { awayScore: number; homeScore: number; winnerTeamId: string | null };
}): Promise<number> {
  const pendingPicks = await db
    .select()
    .from(pickemPicksTable)
    .where(and(
      eq(pickemPicksTable.poolId, opts.poolId),
      eq(pickemPicksTable.gameId, opts.gameId),
      eq(pickemPicksTable.result, "pending"),
    ));

  let graded = 0;
  for (const pick of pendingPicks) {
    let result: "correct" | "incorrect" | "push";
    if (opts.scoringMode === "ats") {
      if (!opts.spreadLine) continue;
      result = gradeNflPickemAtsPick({
        pickedTeamId: pick.pickedTeamId,
        favoriteTeamId: opts.spreadLine.favoriteTeamId,
        spread: opts.spreadLine.spread,
        homeScore: opts.homeScore,
        awayScore: opts.awayScore,
        homeTeamId: opts.homeTeamId,
      });
    } else {
      result = gradeNflPickemStraightPick({
        pickedTeamId: pick.pickedTeamId,
        homeScore: opts.homeScore,
        awayScore: opts.awayScore,
        homeTeamId: opts.homeTeamId,
        awayTeamId: opts.awayTeamId,
      });
    }

    await db
      .update(pickemPicksTable)
      .set({
        result,
        updatedAt: new Date(),
        ...(opts.scoreFields
          ? {
              awayScore: opts.scoreFields.awayScore,
              homeScore: opts.scoreFields.homeScore,
              winnerTeamId: opts.scoreFields.winnerTeamId,
            }
          : {}),
      })
      .where(eq(pickemPicksTable.id, pick.id));
    graded++;
  }
  return graded;
}
