export type SurvivorSport = "nfl" | "nhl" | "nba" | "superleague";
export type SurvivorWipeoutDecision = "void" | "normal" | "manual-review";

/** Pure policy used by the live settlement transaction and its tests. */
export function decideSurvivorWipeout(options: {
  sport: SurvivorSport;
  week: number;
  allAliveAtStartLost: boolean;
  /** NHL/NBA only: proof from the following week's fetched events. */
  followingRegularSeasonSlate?: "confirmed" | "unknown" | "contaminated";
}): SurvivorWipeoutDecision {
  if (!options.allAliveAtStartLost) return "normal";
  if (options.sport === "nfl") return options.week < 18 ? "void" : "manual-review";
  if (options.sport === "superleague") return options.week < 38 ? "void" : "manual-review";
  // Do not guess where a rolling calendar season ends. A next regular-season
  // slate is authoritative proof that this week is non-terminal.
  return options.followingRegularSeasonSlate === "confirmed" ? "void" : "manual-review";
}

export function survivorStateEffect(options: {
  result: "win" | "loss" | "push" | "forfeit";
  strikeCount: number;
  maxStrikes: number;
}): "win" | "strike" | "eliminate" | "none" {
  if (options.result === "push") return "none";
  if (options.result === "win") return "win";
  return options.strikeCount < options.maxStrikes ? "strike" : "eliminate";
}

export function aggregateSurvivorOutcomes(
  aliveEntryIds: number[],
  picks: Array<{ entryId: number; result: "win" | "loss" | "push" | "pending" }>,
): { loserEntryIds: number[]; allAliveAtStartLost: boolean } {
  const pickedEntryIds = new Set(picks.map(pick => pick.entryId));
  const loserEntryIds = new Set(
    picks.filter(pick => pick.result === "loss").map(pick => pick.entryId),
  );
  for (const entryId of aliveEntryIds) {
    if (!pickedEntryIds.has(entryId)) loserEntryIds.add(entryId);
  }
  return {
    loserEntryIds: [...loserEntryIds],
    allAliveAtStartLost:
      aliveEntryIds.length > 0 &&
      aliveEntryIds.every(entryId => loserEntryIds.has(entryId)),
  };
}

export function isCompleteRegularSeasonSlate(games: Array<{
  seasonType?: number;
  isCompleted: boolean;
  isPostponed: boolean;
}>): boolean {
  return games.length > 0 && games.every(game =>
    game.seasonType === 2 && (game.isCompleted || game.isPostponed)
  );
}

export function classifyFollowingRegularSeasonSlate(games: Array<{
  seasonType?: number;
}>): "confirmed" | "unknown" | "contaminated" {
  if (games.length === 0) return "unknown";
  return games.every(game => game.seasonType === 2) ? "confirmed" : "contaminated";
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function superLeagueBoundsForDate(dateEt: string): {
  weekStart: string; weekEnd: string;
} {
  const date = new Date(`${dateEt}T12:00:00Z`);
  const dow = date.getUTCDay();
  const daysSinceFriday = (dow + 2) % 7;
  const daysToFriday = daysSinceFriday <= 3 ? -daysSinceFriday : 7 - daysSinceFriday;
  const weekStart = addDays(dateEt, daysToFriday);
  return { weekStart, weekEnd: addDays(weekStart, 3) };
}

/**
 * Resolve the live Fri–Mon slate without inventing a pool/week calendar.
 * Submitted pick dates are the only authoritative evidence that this pool week
 * started. With no picks, fail closed rather than treating every entry as a
 * forfeit.
 */
export function resolveSuperLeagueSettlementBounds(
  pickDates: Array<string | null>,
): { weekStart: string; weekEnd: string } | null {
  if (pickDates.length === 0 || pickDates.some(date => date == null)) return null;
  const bounds = superLeagueBoundsForDate(pickDates[0]!);
  return pickDates.every(date =>
    date! >= bounds.weekStart && date! <= bounds.weekEnd
  ) ? bounds : null;
}