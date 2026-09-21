type CrazyEightsPoolScope = {
  poolType: string;
  sport: string;
  isRecurring: boolean;
  sandboxMode: boolean;
};

export function isRecurringNhlOrNbaCrazyEights(pool: CrazyEightsPoolScope): boolean {
  return (
    pool.poolType === "crazy_8s"
    && pool.isRecurring
    && !pool.sandboxMode
    && (pool.sport === "nhl" || pool.sport === "nba")
  );
}

export function shouldRecordEmptyCrazyEightsPeriod(input: {
  inRecurringScope: boolean;
  totalPicks: number;
  scheduleAvailable: boolean;
  hasUnfinishedGames: boolean;
}): boolean {
  return (
    input.inRecurringScope
    && input.totalPicks === 0
    && input.scheduleAvailable
    && !input.hasUnfinishedGames
  );
}

export function isCrazyEightsPeriodAlreadyResolved(input: {
  inRecurringScope: boolean;
  hasPeriodResult: boolean;
  hasLegacyWinner: boolean;
}): boolean {
  return input.inRecurringScope ? input.hasPeriodResult : input.hasLegacyWinner;
}
