/** NHL division scoring: exact slot 3, adjacent slot 1, otherwise 0. */
export function scoreNhlDivisionPositions(actual: string[], predicted: string[]): number {
  if (actual.length !== 8 || predicted.length !== 8) throw new Error("NHL divisions require exactly 8 positions");
  return actual.reduce((score, team, index) => {
    const predictedIndex = predicted.indexOf(team);
    return score + (predictedIndex === index ? 3 : Math.abs(predictedIndex - index) === 1 ? 1 : 0);
  }, 0);
}