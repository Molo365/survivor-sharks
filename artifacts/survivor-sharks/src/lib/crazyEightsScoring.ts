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

type GridPickLike = {
  confidencePoints: number | null;
  lockedDecimalOdds?: number | null;
  result: string | null;
};

/** Earned vs max possible for weekend grid / live row totals. */
export function crazyEightsWeekendPointsSummary(
  picks: Record<string, GridPickLike>,
  poolType: string,
): { earned: number; ceiling: number; allSettled: boolean } {
  let earned = 0;
  let ceiling = 0;
  let allSettled = true;
  const isMultiplier = poolType === "fast_break_multiplier";

  for (const pick of Object.values(picks)) {
    const cp = pick.confidencePoints ?? 0;
    if (cp <= 0) continue;
    if (pick.result !== "correct" && pick.result !== "incorrect" && pick.result !== "postponed") {
      allSettled = false;
    }
    if (isMultiplier) {
      const dec = pick.lockedDecimalOdds;
      if (dec == null || !Number.isFinite(dec) || dec < 1) continue;
      const slot = cp * dec;
      ceiling += slot;
      if (pick.result === "correct") earned += slot;
    } else {
      ceiling += cp;
      if (pick.result === "correct") earned += cp;
    }
  }

  return { earned, ceiling, allSettled };
}

export function formatCrazyEightsWeekendPointsLabel(
  summary: { earned: number; ceiling: number; allSettled: boolean },
  poolType: string,
): string {
  const isMultiplier = poolType === "fast_break_multiplier";
  if (isMultiplier) {
    return summary.allSettled
      ? `${summary.earned.toFixed(2)} pts`
      : `${summary.earned.toFixed(2)}/${summary.ceiling.toFixed(2)}`;
  }
  return summary.allSettled
    ? `${summary.earned} pts`
    : `${summary.earned}/${summary.ceiling}`;
}

/** Label inside a grid / live cell (below team abbr). */
export function crazyEightsGridCellPointsLabel(
  poolType: string,
  pick: GridPickLike,
): string | null {
  const cp = pick.confidencePoints;
  if (cp == null) return null;
  if (poolType !== "fast_break_multiplier") return `${cp}pt`;

  const dec = pick.lockedDecimalOdds;
  if (dec == null || !Number.isFinite(dec) || dec < 1) return `${cp}pt`;

  if (pick.result === "correct") return (cp * dec).toFixed(2);
  if (pick.result === "incorrect") return "0";
  return `${cp}×${formatDecimalOdds(dec)}`;
}

export type CrazyEightsLiveCellState =
  | "hidden"
  | "correct"
  | "incorrect"
  | "pending"
  | "live_winning"
  | "live_losing";

/** Points shown under the team abbr on the Live board. */
export function crazyEightsLiveCellDisplayPoints(
  poolType: string,
  pick: GridPickLike,
  state: CrazyEightsLiveCellState,
): number | null {
  const cp = pick.confidencePoints;
  if (cp == null) return null;
  if (poolType !== "fast_break_multiplier") return cp;

  const dec = pick.lockedDecimalOdds;
  if (dec == null || !Number.isFinite(dec) || dec < 1) return cp;

  if (state === "incorrect" || state === "live_losing") return 0;
  if (state === "correct" || state === "live_winning") return cp * dec;
  return cp * dec;
}
