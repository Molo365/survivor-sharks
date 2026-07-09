import { db } from "@workspace/db";
import { wcBracketResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchWcBracketMatches } from "./wc";

const ROUND_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarterfinals",
  "semifinals",
  "final",
] as const;

function isTbdName(name: string): boolean {
  return (
    name === "TBD" ||
    name.includes("Winner") ||
    name.includes("Loser") ||
    name.toLowerCase().includes("tbd")
  );
}

/**
 * Returns the ESPN event IDs for the current active bracket round for a given pool.
 *
 * Mirrors resolveCurrentRound() in bracket.ts without coupling to the route layer.
 *
 * Returns:
 *   null      — ESPN bracket API returned no data (unreachable / pre-tournament)
 *   string[]  — event IDs for the current open / in-progress / graded-waiting round
 *               (may be [] if no round has real teams yet)
 *
 * "graded_waiting" state: all currently-announced rounds are fully graded and we are
 * waiting for the next round's matchups to be announced. The last graded round's IDs
 * are returned; players who submitted picks for it will still show "submitted", which
 * is correct — once the next round opens the IDs will change and status resets.
 */
export async function getCurrentBracketRoundEventIds(poolId: number): Promise<string[] | null> {
  const [allMatches, dbResults] = await Promise.all([
    fetchWcBracketMatches(),
    db
      .select({ espnEventId: wcBracketResultsTable.espnEventId })
      .from(wcBracketResultsTable)
      .where(eq(wcBracketResultsTable.poolId, poolId)),
  ]);

  if (allMatches.length === 0) return null;

  const gradedEventIds = new Set(dbResults.map((r) => r.espnEventId));
  const now = new Date();

  const byRound = new Map<string, typeof allMatches>();
  for (const m of allMatches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }

  let lastGames: typeof allMatches = [];

  for (const round of ROUND_ORDER) {
    const games = (byRound.get(round) ?? []).filter(
      (g) => !isTbdName(g.team1) && !isTbdName(g.team2),
    );
    if (games.length === 0) continue;

    lastGames = games;

    const hasUnlocked = games.some((g) => now < new Date(g.matchDate));
    if (hasUnlocked) return games.map((g) => g.espnEventId);

    const allGraded = games.every((g) => gradedEventIds.has(g.espnEventId));
    if (!allGraded) return games.map((g) => g.espnEventId);
    // Fully graded → advance to next round
  }

  // All available rounds are fully graded — return last round's IDs (graded_waiting)
  return lastGames.map((g) => g.espnEventId);
}
