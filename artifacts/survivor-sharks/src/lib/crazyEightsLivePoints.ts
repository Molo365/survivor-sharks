import type { GameSummary, PlayerPick } from "@/components/nflConfidenceLiveTypes";
import { resolveNflConfidenceLivePickCell } from "@/lib/nflConfidenceLivePickCell";

/** Weekend / daily period points — settled correct plus live-winning confidence. */
export function computeCrazyEightsLivePeriodPoints(
  picks: Record<string, PlayerPick>,
  gamesById: Map<string, GameSummary>,
): number {
  let total = 0;
  for (const [gameId, pick] of Object.entries(picks)) {
    const pts = pick.confidencePoints ?? 0;
    if (pts === 0 || !pick.pickedTeamId) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    const result = pick.result;
    if (result === "correct") {
      total += pts;
      continue;
    }
    if (result === "incorrect" || result === "postponed") continue;
    const { state } = resolveNflConfidenceLivePickCell(pick, game);
    if (state === "live_winning") total += pts;
  }
  return total;
}
