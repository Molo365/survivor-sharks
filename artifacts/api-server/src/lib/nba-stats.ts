const ESPN_NBA_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

interface NbaTiebreakerStats {
  totalPoints: number | null;
  threePointersMade: number | null;
}

/**
 * Fetch combined total points and combined three-pointers made for a single
 * completed NBA game from the ESPN boxscore summary endpoint.
 *
 * Returns { totalPoints, threePointersMade } where each is the combined total
 * (home + away). Returns null for a field if either team's value is missing or
 * the request fails — same soft-failure pattern as fetchNhlTiebreakerStats.
 *
 * Note: ESPN's NBA boxscore has no plain "points" stat — total points come
 * from the header competitors' scores. Threes come from the
 * "threePointFieldGoalsMade-threePointFieldGoalsAttempted" stat whose
 * displayValue is "M-A" (e.g. "8-20") — we parse the made count.
 */
export async function fetchNbaTiebreakerStats(eventId: string): Promise<NbaTiebreakerStats> {
  try {
    const res = await fetch(`${ESPN_NBA_SUMMARY}?event=${eventId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { totalPoints: null, threePointersMade: null };

    const data = (await res.json()) as {
      boxscore?: {
        teams?: Array<{
          statistics?: Array<{ name: string; displayValue: string }>;
        }>;
      };
      header?: {
        competitions?: Array<{
          competitors?: Array<{ score?: string }>;
        }>;
      };
    };

    // Total points: sum of both competitors' final scores from the header.
    const competitors = data?.header?.competitions?.[0]?.competitors ?? [];
    let totalPoints = 0;
    let scoresFound = 0;
    for (const c of competitors) {
      const v = parseInt(c.score ?? "", 10);
      if (!isNaN(v)) { totalPoints += v; scoresFound++; }
    }

    // Threes made: parse "M-A" displayValue per team.
    const teams = data?.boxscore?.teams ?? [];
    let totalThrees = 0;
    let threesFound = 0;
    for (const team of teams) {
      for (const stat of team.statistics ?? []) {
        if (stat.name === "threePointFieldGoalsMade-threePointFieldGoalsAttempted") {
          const made = parseInt(stat.displayValue.split("-")[0], 10);
          if (!isNaN(made)) { totalThrees += made; threesFound++; }
        }
      }
    }

    return {
      totalPoints: scoresFound === 2 ? totalPoints : null,
      threePointersMade: threesFound === 2 ? totalThrees : null,
    };
  } catch {
    return { totalPoints: null, threePointersMade: null };
  }
}
