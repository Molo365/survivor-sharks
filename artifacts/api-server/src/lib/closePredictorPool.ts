import { db } from "@workspace/db";
import { entriesTable, poolsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * FIFA World Cup 2026 has 12 groups (A–L).
 * This is the fixed closure threshold for all GSP pools.
 *
 * Do NOT replace this with standings.length from a live ESPN call —
 * the standings endpoint returns different counts depending on tournament
 * phase, API availability, and caching. Using a live value means closure
 * never fires when the API is down or returns fewer groups mid-tournament.
 */
export const GSP_GROUP_COUNT = 12;

type PositionTuple = [string, string, string, string];

/**
 * Unified 4-position scoring rule shared by NDP and GSP:
 *   3 pts — team is in exactly the predicted slot
 *   1 pt  — team was predicted top-2 and finished top-2 (wrong slot)
 *   0 pts — otherwise
 *
 * This replaces the previously-duplicated scoreDivision() / scoreGroup()
 * functions, which had identical logic.
 * Exported so future pool types can reuse it directly.
 */
export function scorePositions(actual: PositionTuple, predicted: PositionTuple): number {
  let pts = 0;
  for (let i = 0; i < 4; i++) {
    const team = actual[i];
    const predictedPos = predicted.indexOf(team);
    if (predictedPos === i) {
      pts += 3;
    } else if (i < 2 && predictedPos >= 0 && predictedPos < 2) {
      pts += 1;
    }
  }
  return pts;
}

interface PositionResult {
  pos1Team: string;
  pos2Team: string;
  pos3Team: string;
  pos4Team: string;
}

interface PositionPick extends PositionResult {
  userId: number;
}

export type ClosureOutcome =
  | { closed: true; winnerIds: number[]; isTie: boolean }
  | { closed: false; reason: "no_members" | "error"; detail?: string };

/**
 * Scores all members, declares winner(s), and marks the pool inactive.
 *
 * Safety guarantees:
 * - Short-circuits before any DB write when winnerIds resolves to [] —
 *   this prevents `inArray(field, [])` which generates invalid SQL in Drizzle.
 * - Returns { closed: false, reason: "error", detail } on any DB failure
 *   instead of silently swallowing it. The caller is responsible for
 *   surfacing closureWarning to the client.
 *
 * Generic design: pass getPickKey to extract the result-map lookup key
 * from any pick row shape. A future pool type (NBA bracket, MLB division
 * predictor, etc.) only needs to build resultMap + allPicks from its own
 * tables and provide the right getPickKey — no other copy-paste required.
 */
export async function closePredictorPool<P extends PositionPick>(params: {
  poolId: number;
  resultMap: Map<string, PositionResult>;
  allPicks: P[];
  memberUserIds: number[];
  getPickKey: (pick: P) => string;
  log: Logger;
}): Promise<ClosureOutcome> {
  const { poolId, resultMap, allPicks, memberUserIds, getPickKey, log } = params;

  if (memberUserIds.length === 0) {
    log.warn({ poolId }, "closePredictorPool: pool has no members — skipping closure");
    return { closed: false, reason: "no_members", detail: "pool has no entries" };
  }

  const picksByUser = new Map<number, P[]>();
  for (const pick of allPicks) {
    if (!picksByUser.has(pick.userId)) picksByUser.set(pick.userId, []);
    picksByUser.get(pick.userId)!.push(pick);
  }

  const scored = memberUserIds.map((uid) => {
    const picks = picksByUser.get(uid) ?? [];
    let total = 0;
    for (const pick of picks) {
      const result = resultMap.get(getPickKey(pick));
      if (result) {
        total += scorePositions(
          [result.pos1Team, result.pos2Team, result.pos3Team, result.pos4Team],
          [pick.pos1Team, pick.pos2Team, pick.pos3Team, pick.pos4Team],
        );
      }
    }
    return { userId: uid, total };
  });

  const topScore = Math.max(0, ...scored.map((s) => s.total));
  const winners = scored.filter((s) => s.total === topScore);
  const winnerIds = winners.map((w) => w.userId);

  if (winnerIds.length === 0) {
    const detail = "score resolution produced no winners (no picks submitted?)";
    log.warn({ poolId }, `closePredictorPool: ${detail}`);
    return { closed: false, reason: "no_members", detail };
  }

  try {
    await db
      .update(entriesTable)
      .set({ finalWinner: true })
      .where(and(eq(entriesTable.poolId, poolId), inArray(entriesTable.userId, winnerIds)));

    await db
      .update(poolsTable)
      .set({
        isActive: false,
        endedAt: new Date(),
        closureReason: winners.length > 1 ? "co_winners" : null,
      })
      .where(eq(poolsTable.id, poolId));

    log.info({ poolId, winnerIds, isTie: winners.length > 1 }, "closePredictorPool: pool closed, winner(s) declared");
    return { closed: true, winnerIds, isTie: winners.length > 1 };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, poolId }, "closePredictorPool: DB update failed — pool stays active");
    return { closed: false, reason: "error", detail };
  }
}
