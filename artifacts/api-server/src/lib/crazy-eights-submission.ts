export type CrazyEightsSubmissionDecision = "allow" | "refuse";

export function decideCrazyEightsSubmission({
  sandbox,
  existingPickCount,
  incremental,
  maxPicks = 8,
}: {
  sandbox: boolean;
  existingPickCount: number;
  /** NBA Fast Break Multiplier: allow more submits until the card has maxPicks locked picks. */
  incremental?: boolean;
  maxPicks?: number;
}): CrazyEightsSubmissionDecision {
  if (sandbox || existingPickCount === 0) return "allow";
  if (incremental && existingPickCount < maxPicks) return "allow";
  return "refuse";
}