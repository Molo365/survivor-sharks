export type MlbBracketPickVisualState = "correct" | "incorrect" | "processing" | "eliminated" | "alive";

export function getMlbBracketPickVisualState({
  winnerCorrect,
  seriesCompleted,
  predictedTeamEliminated,
}: {
  winnerCorrect: boolean | null;
  seriesCompleted: boolean;
  predictedTeamEliminated: boolean;
}): MlbBracketPickVisualState {
  if (winnerCorrect === true) return "correct";
  if (winnerCorrect === false) return "incorrect";
  if (seriesCompleted) return "processing";
  if (predictedTeamEliminated) return "eliminated";
  return "alive";
}