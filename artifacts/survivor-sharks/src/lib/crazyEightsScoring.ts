/** Mirrors api-server crazy-eights-scoring for UI totals. */
export function crazyEightsCorrectPickPoints(
  poolType: string,
  pick: {
    confidencePoints: number | null;
    lockedDecimalOdds?: number | null;
    result: string | null;
  },
): number {
  if (pick.result !== "correct" || pick.confidencePoints == null) return 0;
  const cp = Number(pick.confidencePoints);
  if (!Number.isFinite(cp) || cp <= 0) return 0;
  if (poolType === "fast_break_multiplier") {
    const dec = pick.lockedDecimalOdds;
    if (dec == null || !Number.isFinite(dec) || dec < 1) return 0;
    return cp * dec;
  }
  return cp;
}

export function crazyEightsLivePickPoints(
  poolType: string,
  pick: {
    confidencePoints: number | null;
    lockedDecimalOdds?: number | null;
    result: string | null;
    pickedTeamId?: string | null;
  },
  liveWinning: boolean,
): number {
  const cp = pick.confidencePoints ?? 0;
  if (cp === 0 || !pick.pickedTeamId) return 0;
  if (pick.result === "correct") {
    return crazyEightsCorrectPickPoints(poolType, pick);
  }
  if (pick.result === "incorrect" || pick.result === "postponed") return 0;
  if (!liveWinning) return 0;
  if (poolType === "fast_break_multiplier") {
    const dec = pick.lockedDecimalOdds;
    if (dec == null || !Number.isFinite(dec) || dec < 1) return 0;
    return cp * dec;
  }
  return cp;
}

export function formatDecimalOdds(dec: number): string {
  if (!Number.isFinite(dec)) return "—";
  return dec.toFixed(2);
}
