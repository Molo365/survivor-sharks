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

/** Standings: NHL weekly + NBA Pick'em show every submitted guess (office-pool style). */
export function revealTiebreakerGuessForStandings(
  pool: { sport: string; poolType: string; pickFrequency: string },
  guess: number | null,
  kickoffReveal: boolean,
): boolean {
  if (guess == null) return false;
  if (isNhlWeeklyPickemPool(pool) || isNbaAtsPickemPool(pool)) return true;
  return kickoffReveal;
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
