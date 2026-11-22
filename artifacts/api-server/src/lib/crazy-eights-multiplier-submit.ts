export const MULTIPLIER_MAX_PICKS = 8;

/** Max confidence label for the weekend — forfeits high values when games already started. */
export function multiplierMaxConfidenceValue(
  existingPickCount: number,
  openPickableCount: number,
): number {
  return Math.min(MULTIPLIER_MAX_PICKS, existingPickCount + openPickableCount);
}

export function validateMultiplierChunkSubmit(opts: {
  existingGameIds: ReadonlySet<string>;
  existingConfidence: ReadonlySet<number>;
  newPicks: Array<{ gameId: string; confidencePoints: number }>;
  maxConfidenceValue?: number;
}): string | null {
  const { existingGameIds, existingConfidence, newPicks } = opts;
  const confidenceCap = opts.maxConfidenceValue ?? MULTIPLIER_MAX_PICKS;
  if (existingGameIds.size >= MULTIPLIER_MAX_PICKS) {
    return "You already have 8 locked picks for this weekend.";
  }
  if (newPicks.length === 0) {
    return "Select at least one game to submit.";
  }
  const room = MULTIPLIER_MAX_PICKS - existingGameIds.size;
  if (newPicks.length > room) {
    return `You can lock at most ${room} more pick${room === 1 ? "" : "s"} this weekend.`;
  }
  const newConfidence: number[] = [];
  for (const pick of newPicks) {
    if (existingGameIds.has(pick.gameId)) {
      return "One or more games were already submitted and are locked.";
    }
    if (pick.confidencePoints < 1 || pick.confidencePoints > confidenceCap) {
      return confidenceCap < MULTIPLIER_MAX_PICKS
        ? `Confidence points must be between 1 and ${confidenceCap} — only ${confidenceCap} game${confidenceCap === 1 ? "" : "s"} remain this weekend.`
        : `Confidence points must be between 1 and ${MULTIPLIER_MAX_PICKS}.`;
    }
    if (existingConfidence.has(pick.confidencePoints)) {
      return `Confidence ${pick.confidencePoints} is already used on a locked pick.`;
    }
    newConfidence.push(pick.confidencePoints);
  }
  if (new Set(newConfidence).size !== newConfidence.length) {
    return "Each confidence value may only be used once per submit.";
  }
  return null;
}
