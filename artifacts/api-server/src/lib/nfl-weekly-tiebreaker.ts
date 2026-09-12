export interface NflScheduledGame {
  id: string;
  startTime: string | Date | null | undefined;
}

export type WeeklyTiebreakerStatus = "not_needed" | "pending" | "resolved";

export interface WeeklyTiebreakerRecord {
  userId: number;
  guess: number;
  actual: number | null;
}

export interface WeeklyTiebreakerResolution<T> {
  status: WeeklyTiebreakerStatus;
  actual: number | null;
  winners: T[];
}

export function combineNflTiebreakerYards(stats: {
  actualPassingYards: number;
  actualRushingYards: number;
}): number {
  return stats.actualPassingYards + stats.actualRushingYards;
}

export function parseNflWeeklyTiebreakerActual(
  teams: Array<{
    statistics?: Array<{ name: string; displayValue: string }>;
  }>,
): number | null {
  if (teams.length !== 2) return null;

  let total = 0;
  for (const team of teams) {
    let passing: number | null = null;
    let rushing: number | null = null;
    for (const stat of team.statistics ?? []) {
      if (stat.name === "netPassingYards") {
        const value = parseInt(stat.displayValue, 10);
        if (!Number.isNaN(value)) passing = value;
      } else if (stat.name === "passingYards" && passing === null) {
        const value = parseInt(stat.displayValue, 10);
        if (!Number.isNaN(value)) passing = value;
      } else if (stat.name === "rushingYards") {
        const value = parseInt(stat.displayValue, 10);
        if (!Number.isNaN(value)) rushing = value;
      }
    }
    if (passing === null || rushing === null) return null;
    total += passing + rushing;
  }

  return total;
}

export function resolveWeeklyTiebreaker<T extends { userId: number }>(
  scoreLeaders: T[],
  records: WeeklyTiebreakerRecord[],
): WeeklyTiebreakerResolution<T> {
  if (scoreLeaders.length <= 1) {
    return { status: "not_needed", actual: null, winners: scoreLeaders };
  }

  const recordByUser = new Map(records.map((record) => [record.userId, record]));
  const leaderRecords = scoreLeaders.map((leader) => recordByUser.get(leader.userId));
  if (
    leaderRecords.some(
      (record) =>
        !record ||
        !Number.isInteger(record.guess) ||
        record.actual === null ||
        !Number.isInteger(record.actual),
    )
  ) {
    return { status: "pending", actual: null, winners: scoreLeaders };
  }

  const actuals = new Set(leaderRecords.map((record) => record!.actual!));
  if (actuals.size !== 1) {
    return { status: "pending", actual: null, winners: scoreLeaders };
  }

  const actual = leaderRecords[0]!.actual!;
  const differences = new Map(
    leaderRecords.map((record) => [record!.userId, Math.abs(record!.guess - actual)]),
  );
  const closestDifference = Math.min(...differences.values());

  return {
    status: "resolved",
    actual,
    winners: scoreLeaders.filter(
      (leader) => differences.get(leader.userId) === closestDifference,
    ),
  };
}

/**
 * Weekly bonus tiebreakers use the final scheduled kickoff on that week's
 * board. This is intentionally separate from the existing Week 18 season-end
 * tiebreaker selection paths.
 */
export function findLastNflGameByKickoff(games: NflScheduledGame[]): NflScheduledGame | null {
  return [...games]
    .filter((game) => game.id && game.startTime && !Number.isNaN(new Date(game.startTime).getTime()))
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime())
    .at(-1) ?? null;
}