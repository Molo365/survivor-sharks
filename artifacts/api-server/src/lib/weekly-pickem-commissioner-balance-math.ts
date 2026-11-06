/** Entry due for `weekCount` billing periods at `entryFee` each (period-pot recurring pick-em). */
export function weeklyPickEmWeeklyEntryDollars(entryFee: number, weekCount: number): number {
  if (entryFee <= 0 || weekCount <= 0) return 0;
  return entryFee * weekCount;
}
