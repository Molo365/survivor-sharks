export type NflConfidenceWeeklyWinnerLeaderboard = {
  week: number;
  actualPassingYards: number | null;
  players: Array<{
    rank: number;
    userId: number;
    username: string;
    displayName: string | null;
    weekPoints: number;
    gradedPicks: number;
    totalPicks: number;
    potSplit: boolean;
  }>;
};

type WeeklyWinnerRow = NflConfidenceWeeklyWinnerLeaderboard["players"][number];

function weeklyWinnerFromLeaderboard(
  data: NflConfidenceWeeklyWinnerLeaderboard | undefined,
): WeeklyWinnerRow | null {
  if (!data || data.actualPassingYards == null) return null;
  return data.players[0] ?? null;
}

/** Prefer the just-finished week when the pool has rolled to a new empty slate. */
export function resolveNflConfidenceWeeklyWinnerDisplay(
  poolWeek: number,
  currentWeekData: NflConfidenceWeeklyWinnerLeaderboard | undefined,
  previousWeekData: NflConfidenceWeeklyWinnerLeaderboard | undefined,
): { displayWeek: number; winner: WeeklyWinnerRow | null; isLastWeek: boolean } {
  const currentWinner = weeklyWinnerFromLeaderboard(currentWeekData);
  if (currentWinner) {
    return { displayWeek: poolWeek, winner: currentWinner, isLastWeek: false };
  }
  if (poolWeek <= 1) {
    return { displayWeek: poolWeek, winner: null, isLastWeek: false };
  }
  const prevWinner = weeklyWinnerFromLeaderboard(previousWeekData);
  return { displayWeek: poolWeek - 1, winner: prevWinner, isLastWeek: true };
}
