export function multiplierLinesNotifyPeriodKey(week: number, linesCount: number): string {
  return `nba-multiplier|week-${week}|lines:${linesCount}`;
}

export function shouldNotifyMultiplierLinesBump(
  lastNotifiedCount: number,
  currentLinesCount: number,
): boolean {
  return currentLinesCount > 0 && currentLinesCount > lastNotifiedCount;
}