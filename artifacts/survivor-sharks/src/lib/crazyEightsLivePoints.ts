import type { GameSummary, PlayerPick } from "@/components/nflConfidenceLiveTypes";
import { resolveNflConfidenceLivePickCell } from "@/lib/nflConfidenceLivePickCell";
import { crazyEightsLivePickPoints } from "@/lib/crazyEightsScoring";

/** Weekend / daily period points — settled correct plus live-winning confidence. */
export function computeCrazyEightsLivePeriodPoints(
  picks: Record<string, PlayerPick>,
  gamesById: Map<string, GameSummary>,
  poolType = "crazy_8s",
): number {
  let total = 0;
  for (const [gameId, pick] of Object.entries(picks)) {
    if ((pick.confidencePoints ?? 0) === 0 || !pick.pickedTeamId) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    const { state } = resolveNflConfidenceLivePickCell(pick, game);
    total += crazyEightsLivePickPoints(poolType, pick, state === "live_winning");
  }
  return total;
}
