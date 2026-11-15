/**
 * Survivor pools can temporarily hold graded picks on week N while
 * pool.currentWeek sits at N−1 after Tuesday rollover reconciliation.
 * Settlement must walk every pick week that lacks weekResults, not only currentWeek.
 */

export function orderedUnsettledSurvivorWeeksFromPicks(
  pickWeeks: number[],
  finalizedWeeks: Iterable<number>,
): number[] {
  const finalized = new Set(finalizedWeeks);
  return [...new Set(pickWeeks)]
    .filter(week => !finalized.has(week))
    .sort((a, b) => a - b);
}