export type CrazyEightsSubmissionDecision = "allow" | "refuse";

export function decideCrazyEightsSubmission({
  sandbox,
  existingPickCount,
}: {
  sandbox: boolean;
  existingPickCount: number;
}): CrazyEightsSubmissionDecision {
  if (sandbox || existingPickCount === 0) return "allow";
  return "refuse";
}