const ESPN_NHL_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary";

interface NhlTiebreakerStats {
  shotsOnGoal: number | null;
  penaltyMinutes: number | null;
}

/**
 * Fetch shots on goal and penalty minutes for a single completed NHL game
 * from the ESPN boxscore summary endpoint.
 *
 * Returns { shotsOnGoal, penaltyMinutes } where each is the combined total
 * (home + away). Returns null for a field if either team's value is missing or
 * the request fails — same soft-failure pattern as fetchDailyStrikeouts.
 */
export async function fetchNhlTiebreakerStats(eventId: string): Promise<NhlTiebreakerStats> {
  try {
    const res = await fetch(`${ESPN_NHL_SUMMARY}?event=${eventId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { shotsOnGoal: null, penaltyMinutes: null };

    const data = (await res.json()) as {
      boxscore?: {
        teams?: Array<{
          statistics?: Array<{ name: string; displayValue: string }>;
        }>;
      };
    };

    const teams = data?.boxscore?.teams ?? [];
    let totalShots = 0;
    let totalPim = 0;
    let shotsFound = 0;
    let pimFound = 0;

    for (const team of teams) {
      for (const stat of team.statistics ?? []) {
        if (stat.name === "shotsTotal") {
          const v = parseInt(stat.displayValue, 10);
          if (!isNaN(v)) { totalShots += v; shotsFound++; }
        }
        if (stat.name === "penaltyMinutes") {
          const v = parseInt(stat.displayValue, 10);
          if (!isNaN(v)) { totalPim += v; pimFound++; }
        }
      }
    }

    return {
      shotsOnGoal: shotsFound === 2 ? totalShots : null,
      penaltyMinutes: pimFound === 2 ? totalPim : null,
    };
  } catch {
    return { shotsOnGoal: null, penaltyMinutes: null };
  }
}
