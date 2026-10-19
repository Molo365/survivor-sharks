export function isNhlWeeklyPickemPool(pool: {
  sport: string;
  poolType: string;
  pickFrequency: string;
}): boolean {
  return pool.sport === "nhl" && pool.poolType === "pickem" && pool.pickFrequency === "weekly";
}

export function isNbaAtsPickemPool(pool: { poolType: string }): boolean {
  return pool.poolType === "nba_ats";
}

/** True once any game in the pick period has reached its lock (started). */
export function isPickemPeriodLockedForTiebreakerReveal(
  gameStartIsos: string[],
  nowMs = Date.now(),
): boolean {
  return gameStartIsos.some((iso) => {
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t <= nowMs;
  });
}

/**
 * Standings/grid: show tiebreaker guesses once the viewer may see them.
 * Office-style pools (NHL weekly, NBA ATS) also reveal when the pick period is locked,
 * not only after the tiebreaker game starts.
 */
export function revealTiebreakerGuessForStandings(
  pool: { sport: string; poolType: string; pickFrequency: string },
  guess: number | null,
  kickoffReveal: boolean,
  opts?: { periodLocked?: boolean },
): boolean {
  if (guess == null) return false;
  const periodLocked = opts?.periodLocked === true;
  if (isNhlWeeklyPickemPool(pool) || isNbaAtsPickemPool(pool)) {
    return kickoffReveal || periodLocked;
  }
  return kickoffReveal || periodLocked;
}

export function formatNhlSogTiebreakerColumnHeader(
  awayAbbreviation: string,
  homeAbbreviation: string,
  actualShotsOnGoal: number | null,
): string {
  const actual = actualShotsOnGoal != null ? String(actualShotsOnGoal) : "TBD";
  return `${awayAbbreviation}/${homeAbbreviation} SOG (${actual})`;
}

/** Fast Break / NBA Crazy 8s weekend grid — combined points on last game. */
export function formatNbaPointsTiebreakerColumnHeader(
  awayAbbreviation: string,
  homeAbbreviation: string,
  actualCombinedPoints: number | null,
): string {
  const actual = actualCombinedPoints != null ? String(actualCombinedPoints) : "TBD";
  return `${awayAbbreviation}/${homeAbbreviation} PTS (${actual})`;
}
