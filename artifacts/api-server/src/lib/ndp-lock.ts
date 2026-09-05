import { fetchNflGamesByWeek, type EspnGame } from "./espn";

export type NdpLockSource = "espn" | "cache" | "fallback" | "sandbox";

export interface NdpLockState {
  lockAt: Date | null;
  locked: boolean;
  source: NdpLockSource;
}

type FetchNflWeek = (week: number, season: number, seasonType: number) => Promise<EspnGame[]>;

// Safety values are deliberately per-season, rather than an environment override.
// They are used only until ESPN publishes a valid regular-season Week 1 event.
export const NDP_LOCK_FALLBACKS: Readonly<Record<number, Date>> = {
  2025: new Date("2025-09-05T00:20:00.000Z"),
  2026: new Date("2026-09-10T00:20:00.000Z"),
  2027: new Date("2027-09-09T00:20:00.000Z"),
};

const resolvedLocks = new Map<number, Date>();
const MIN_REASONABLE_NFL_SEASON = 1920;
const MAX_REASONABLE_NFL_SEASON = 2200;

/**
 * Produces a deterministic safety lock for seasons without a known override.
 *
 * The NFL opener is conventionally Thursday in the September 4–10 window. We
 * select the first Thursday in that window at 8:20 PM America/New_York. Every
 * date in that window is EDT under current US daylight-saving rules, so that
 * local kickoff is 00:20 UTC on the following calendar day. This is only a
 * fail-closed safety approximation; valid ESPN event data always supersedes it.
 */
function assertReasonableNflSeason(season: number): void {
  if (!Number.isInteger(season) || season < MIN_REASONABLE_NFL_SEASON || season > MAX_REASONABLE_NFL_SEASON) {
    throw new Error(`Invalid NFL season for NDP lock: ${season}`);
  }
}

function deriveNdpLockFallback(season: number): Date {
  assertReasonableNflSeason(season);

  const known = NDP_LOCK_FALLBACKS[season];
  if (known) return known;

  const septemberFourth = new Date(Date.UTC(season, 8, 4));
  const daysUntilThursday = (4 - septemberFourth.getUTCDay() + 7) % 7;
  const openerDay = 4 + daysUntilThursday;
  return new Date(Date.UTC(season, 8, openerDay + 1, 0, 20));
}

function isRequestedRegularSeasonGame(game: EspnGame, season: number): boolean {
  return (
    game.seasonYear === season &&
    game.seasonType === 2 &&
    Number.isFinite(new Date(game.date).getTime())
  );
}

/**
 * Resolves the first kickoff in an NFL regular season. ESPN's scoreboard can
 * return stale/preseason events despite query parameters, so candidates are
 * validated again from their event metadata before being trusted.
 */
export async function resolveNdpLock(
  season: number,
  options: { fetchWeek?: FetchNflWeek; now?: Date } = {},
): Promise<NdpLockState> {
  assertReasonableNflSeason(season);
  const now = options.now ?? new Date();
  const cached = resolvedLocks.get(season);
  if (cached) {
    return { lockAt: cached, locked: now.getTime() >= cached.getTime(), source: "cache" };
  }

  let games: EspnGame[] = [];
  try {
    games = await (options.fetchWeek ?? fetchNflGamesByWeek)(1, season, 2);
  } catch {
    // Treat an unavailable provider the same as an empty/invalid ESPN response.
    // The cached value above, when present, is always preferred.
  }
  const validGames = games.filter((game) => isRequestedRegularSeasonGame(game, season));
  if (validGames.length > 0) {
    const lockAt = new Date(Math.min(...validGames.map((game) => new Date(game.date).getTime())));
    resolvedLocks.set(season, lockAt);
    return { lockAt, locked: now.getTime() >= lockAt.getTime(), source: "espn" };
  }

  const fallback = deriveNdpLockFallback(season);
  return { lockAt: fallback, locked: now.getTime() >= fallback.getTime(), source: "fallback" };
}

/** Sandbox pools never use an external-season deadline, so simulations remain editable. */
export async function getNdpLockState(
  season: number,
  sandboxMode: boolean,
  options: { fetchWeek?: FetchNflWeek; now?: Date } = {},
): Promise<NdpLockState> {
  if (sandboxMode) return { lockAt: null, locked: false, source: "sandbox" };
  return resolveNdpLock(season, options);
}

/** Test-only cache isolation; not used by request handlers. */
export function clearNdpLockCacheForTests(): void {
  resolvedLocks.clear();
}