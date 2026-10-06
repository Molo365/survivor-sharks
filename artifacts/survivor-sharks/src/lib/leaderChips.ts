import type { NflPickEmSeasonLeaderboardEntry } from "@workspace/api-client-react";

export interface LeaderChipSummary {
  names: string[];
  points: number;
  live: number;
}

export interface LeaderChipLeaders {
  season: LeaderChipSummary | null;
  week: LeaderChipSummary | null;
}

export type LeaderChipLeftMode = "current-week" | "previous-week" | "upcoming";

export interface LeaderChipLeftDisplay {
  mode: LeaderChipLeftMode;
  weekNumber: number;
  leader: LeaderChipSummary | null;
}

export interface PrevWeekWinnerInput {
  displayName?: string | null;
  username: string;
  correct: number;
}

/** Sunday 5pm ET onward + all Monday — main slate window, not TNF. */
export const NFL_PICKEM_SEASON_WEEK_LEADER_START_HOUR_ET = 17;

function playerName(entry: NflPickEmSeasonLeaderboardEntry): string {
  return entry.displayName ?? entry.username;
}

function summarizeLeaders(
  entries: NflPickEmSeasonLeaderboardEntry[],
  getPoints: (entry: NflPickEmSeasonLeaderboardEntry) => number | undefined,
): LeaderChipSummary | null {
  const scoredEntries = entries
    .map((entry) => {
      const live = entry.liveCorrect ?? 0;
      return {
        entry,
        live,
        points: (getPoints(entry) ?? 0) + live,
      };
    })
    .filter(({ points }) => points != null && Number.isFinite(points));

  if (scoredEntries.length === 0) return null;

  const highestPoints = Math.max(...scoredEntries.map(({ points }) => points!));
  if (highestPoints <= 0) return null;

  return {
    names: scoredEntries
      .filter(({ points }) => points === highestPoints)
      .map(({ entry }) => playerName(entry)),
    points: highestPoints,
    live: Math.max(
      ...scoredEntries
        .filter(({ points }) => points === highestPoints)
        .map(({ live }) => live),
    ),
  };
}

export function getLeaders(
  entries: NflPickEmSeasonLeaderboardEntry[],
  currentWeek: number,
): LeaderChipLeaders {
  const weekKey = String(currentWeek);

  return {
    season: summarizeLeaders(entries, (entry) => entry.seasonCorrect),
    week: summarizeLeaders(
      entries,
      (entry) => entry.weeklyScores[weekKey]?.correct,
    ),
  };
}

export function summarizePrevWeekWinners(
  winners: PrevWeekWinnerInput[],
): LeaderChipSummary | null {
  if (winners.length === 0) return null;
  const topCorrect = winners[0]?.correct ?? 0;
  return {
    names: winners.map((w) => w.displayName ?? w.username),
    points: topCorrect,
    live: 0,
  };
}

export function getEtWeekdayAndHour(now: Date): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { weekday, hour };
}

/** When to show a meaningful current-week leader (not Thu/Fri/Sat one-game ties). */
export function shouldShowNflPickEmSeasonCurrentWeekLeader(now: Date = new Date()): boolean {
  const { weekday, hour } = getEtWeekdayAndHour(now);
  if (weekday === "Mon") return true;
  if (weekday === "Sun" && hour >= NFL_PICKEM_SEASON_WEEK_LEADER_START_HOUR_ET) return true;
  return false;
}

export function resolveLeaderChipLeftDisplay(input: {
  currentWeek: number;
  leaders: LeaderChipLeaders;
  previousWeekNumber: number | null;
  previousWeekWinners: PrevWeekWinnerInput[] | null;
  now?: Date;
}): LeaderChipLeftDisplay {
  const now = input.now ?? new Date();
  const showCurrent = shouldShowNflPickEmSeasonCurrentWeekLeader(now);

  if (showCurrent) {
    return {
      mode: "current-week",
      weekNumber: input.currentWeek,
      leader: input.leaders.week,
    };
  }

  if (input.previousWeekNumber != null && input.previousWeekWinners?.length) {
    return {
      mode: "previous-week",
      weekNumber: input.previousWeekNumber,
      leader: summarizePrevWeekWinners(input.previousWeekWinners),
    };
  }

  return {
    mode: "upcoming",
    weekNumber: input.currentWeek,
    leader: null,
  };
}
