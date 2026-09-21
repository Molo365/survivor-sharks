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