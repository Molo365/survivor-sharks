const ESPN_ENDPOINTS: Record<string, string> = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
  mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  nhl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl",
  fifa: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world",
};

export interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  logo?: string;
}

export interface EspnLiveState {
  inning: number;
  isTopInning: boolean;
  outs: number;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  currentBatter: string | null;
  currentPitcher: string | null;
  shortDetail: string | null;
}

export interface EspnStartingPitcher {
  name: string;
  era: string | null;
  wins: number | null;
  losses: number | null;
}

export interface EspnGame {
  id: string;
  date: string;          // ISO timestamp — game start time
  status: "scheduled" | "in_progress" | "final";
  homeTeam: EspnTeam;
  awayTeam: EspnTeam;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  hasStarted: boolean;
  liveState: EspnLiveState | null;
  homeStartingPitcher: EspnStartingPitcher | null;
  awayStartingPitcher: EspnStartingPitcher | null;
}

type EspnProbable = {
  athlete?: {
    fullName?: string;
    shortName?: string;
    statistics?: { name: string; displayValue: string }[];
  };
};

type EspnSituation = {
  balls?: number;
  strikes?: number;
  outs?: number;
  onFirst?: boolean;
  onSecond?: boolean;
  onThird?: boolean;
  batter?: { athlete?: { fullName?: string; shortName?: string } };
  pitcher?: { athlete?: { fullName?: string; shortName?: string } };
};

type EspnCompetitor = {
  homeAway: string;
  score?: string;
  team: { id: string; abbreviation: string; displayName: string; logo?: string };
  probables?: EspnProbable[];
};

type EspnEvent = {
  id: string;
  date: string;
  competitions?: {
    competitors?: EspnCompetitor[];
    status?: {
      period?: number;
      type?: { completed?: boolean; name?: string; state?: string; shortDetail?: string };
    };
    situation?: EspnSituation;
  }[];
};

function extractStartingPitcher(probable: EspnProbable | undefined): EspnStartingPitcher | null {
  if (!probable?.athlete?.fullName) return null;
  const stats = probable.athlete.statistics ?? [];
  const era = stats.find(s => s.name === "ERA" || s.name === "era")?.displayValue ?? null;
  const record = stats.find(s => s.name === "record" || s.name === "Record")?.displayValue ?? null;
  let wins: number | null = null;
  let losses: number | null = null;
  if (record) {
    const parts = record.split("-").map(Number);
    wins = isNaN(parts[0]) ? null : parts[0];
    losses = isNaN(parts[1]) ? null : parts[1];
  }
  const wStat = stats.find(s => s.name === "wins")?.displayValue;
  const lStat = stats.find(s => s.name === "losses")?.displayValue;
  if (wStat) wins = parseInt(wStat, 10) || null;
  if (lStat) losses = parseInt(lStat, 10) || null;
  return {
    name: probable.athlete.fullName,
    era,
    wins,
    losses,
  };
}

function parseGame(event: EspnEvent): EspnGame {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === "home");
  const away = comp?.competitors?.find(c => c.homeAway === "away");
  const state = comp?.status?.type?.state ?? "pre";
  const isCompleted = comp?.status?.type?.completed ?? false;
  const hasStarted = state === "in" || state === "post" || isCompleted;

  // Live game state (only present when game is in progress)
  let liveState: EspnLiveState | null = null;
  if (state === "in" && !isCompleted) {
    const sit = comp?.situation;
    const period = comp?.status?.period ?? 1;
    const shortDetail = comp?.status?.type?.shortDetail ?? null;
    const isTopInning = shortDetail != null ? shortDetail.startsWith("Top") : true;
    liveState = {
      inning: period,
      isTopInning,
      outs: sit?.outs ?? 0,
      onFirst: sit?.onFirst ?? false,
      onSecond: sit?.onSecond ?? false,
      onThird: sit?.onThird ?? false,
      currentBatter: sit?.batter?.athlete?.shortName ?? sit?.batter?.athlete?.fullName ?? null,
      currentPitcher: sit?.pitcher?.athlete?.shortName ?? sit?.pitcher?.athlete?.fullName ?? null,
      shortDetail,
    };
  }

  return {
    id: event.id,
    date: event.date,
    status: isCompleted ? "final" : hasStarted ? "in_progress" : "scheduled",
    homeTeam: {
      id: home?.team.id ?? "",
      abbreviation: home?.team.abbreviation ?? "",
      displayName: home?.team.displayName ?? "",
      logo: home?.team.logo,
    },
    awayTeam: {
      id: away?.team.id ?? "",
      abbreviation: away?.team.abbreviation ?? "",
      displayName: away?.team.displayName ?? "",
      logo: away?.team.logo,
    },
    homeScore: home?.score != null ? parseInt(home.score) : null,
    awayScore: away?.score != null ? parseInt(away.score) : null,
    isCompleted,
    hasStarted,
    liveState,
    homeStartingPitcher: extractStartingPitcher(home?.probables?.[0]),
    awayStartingPitcher: extractStartingPitcher(away?.probables?.[0]),
  };
}

async function fetchGames(sport: string, week?: number): Promise<EspnGame[]> {
  const base = ESPN_ENDPOINTS[sport];
  if (!base) return [];

  const url = sport === "nfl" && week
    ? `${base}/scoreboard?week=${week}&seasontype=2`
    : `${base}/scoreboard`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json() as { events?: EspnEvent[] };
    return (data.events ?? []).map(parseGame);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// MLB week utilities
// ---------------------------------------------------------------------------

// EDT offset (UTC-4). MLB season runs Apr–Oct — EDT is correct for this period.
const EDT_OFFSET_MS = 4 * 60 * 60 * 1000;

/**
 * Convert a UTC Date into an object representing ET local time (using EDT = UTC-4).
 * All getUTC* methods on the returned Date give ET local values.
 */
function asEtDate(utc: Date): Date {
  return new Date(utc.getTime() - EDT_OFFSET_MS);
}

/**
 * Convert an ET "local midnight" back to UTC.
 */
function fromEtDate(etDate: Date): Date {
  return new Date(etDate.getTime() + EDT_OFFSET_MS);
}

/**
 * Format a UTC date as YYYYMMDD using ET local date (for ESPN API calls).
 */
export function formatDateEt(utcDate: Date): string {
  const et = asEtDate(utcDate);
  const year = et.getUTCFullYear();
  const month = String(et.getUTCMonth() + 1).padStart(2, "0");
  const day = String(et.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Format a UTC date as YYYY-MM-DD using ET local date.
 */
export function formatDateEtDash(utcDate: Date): string {
  const et = asEtDate(utcDate);
  const year = et.getUTCFullYear();
  const month = String(et.getUTCMonth() + 1).padStart(2, "0");
  const day = String(et.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the UTC timestamp of the Monday at midnight ET that is on or after
 * the given UTC date. If the date IS a Monday in ET, returns that same Monday.
 * Used to find a pool's "first MLB week Monday" based on its createdAt date.
 */
export function getFirstMlbWeekMonday(poolCreatedAt: Date): Date {
  const etDate = asEtDate(poolCreatedAt);
  const dow = etDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Days until next Monday (0 if already Monday)
  const daysToMonday = dow === 1 ? 0 : (8 - dow) % 7;

  const mondayEt = new Date(etDate);
  mondayEt.setUTCHours(0, 0, 0, 0);
  mondayEt.setUTCDate(mondayEt.getUTCDate() + daysToMonday);

  return fromEtDate(mondayEt); // UTC: Monday 04:00 UTC (EDT)
}

export interface MlbWeekBounds {
  /** UTC timestamp of Monday 00:00 ET for the week */
  weekStart: Date;
  /** UTC timestamp of Sunday 23:59:59 ET for the week */
  weekEnd: Date;
  /** UTC timestamp of Monday 22:00 ET (pick deadline / results processing trigger) */
  deadline: Date;
  /** Whether the current time is past the pick deadline */
  deadlinePassed: boolean;
  /** Human-readable label e.g. "May 26 – Jun 1" */
  weekLabel: string;
  /** Array of ET date strings (YYYY-MM-DD) for each day Mon–Sun */
  days: string[];
  /** Array of YYYYMMDD formatted date strings for ESPN API calls */
  espnDates: string[];
}

/**
 * Compute bounds for the Nth MLB week of a pool.
 *
 * @param poolCreatedAt  pool.createdAt (UTC)
 * @param weekNumber     pool.currentWeek (1-indexed)
 */
export function getMlbWeekBounds(poolCreatedAt: Date, weekNumber: number): MlbWeekBounds {
  const firstMonday = getFirstMlbWeekMonday(poolCreatedAt);

  // Monday of week N (UTC)
  const weekStartUtc = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);

  // Pick deadline = Monday 22:00 ET = weekStartUtc + 22h (since weekStartUtc is Monday 04:00 UTC in EDT)
  const deadlineUtc = new Date(weekStartUtc.getTime() + 22 * 60 * 60 * 1000);

  // Sunday 23:59:59 ET = weekStart + 7 days - 1ms
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  // Build list of ET date strings for each day (Mon–Sun)
  const days: string[] = [];
  const espnDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(weekStartUtc.getTime() + i * 24 * 60 * 60 * 1000);
    days.push(formatDateEtDash(dayUtc));
    espnDates.push(formatDateEt(dayUtc));
  }

  // Week label: e.g. "May 26 – Jun 1"
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  const weekLabel = `${fmt.format(weekStartUtc)} – ${fmt.format(weekEndUtc)}`;

  return {
    weekStart: weekStartUtc,
    weekEnd: weekEndUtc,
    deadline: deadlineUtc,
    deadlinePassed: Date.now() >= deadlineUtc.getTime(),
    weekLabel,
    days,
    espnDates,
  };
}

/**
 * Returns the processing trigger time for week N of an MLB pool.
 * This is the deadline of week N+1 (Monday 10 PM ET after the week ends).
 */
export function getMlbProcessingTrigger(poolCreatedAt: Date, weekNumber: number): Date {
  // Processing week N triggers on the deadline of week N+1
  return getMlbWeekBounds(poolCreatedAt, weekNumber + 1).deadline;
}

/**
 * Return today's date as YYYY-MM-DD in ET (America/New_York using fixed EDT offset).
 */
export function getTodayEtDate(): string {
  return formatDateEtDash(new Date());
}

/**
 * Given today's game list, return the deadline timestamp (5 min before first game).
 * Returns null if there are no games.
 */
export function getDailyPickDeadline(games: EspnGame[]): Date | null {
  if (games.length === 0) return null;
  const firstMs = Math.min(...games.map(g => new Date(g.date).getTime()));
  return new Date(firstMs - 5 * 60 * 1000);
}

/**
 * Returns true if the daily pick deadline has passed for a given game list.
 */
export function isDailyPickDeadlinePassed(games: EspnGame[]): boolean {
  const deadline = getDailyPickDeadline(games);
  if (!deadline) return false;
  return Date.now() >= deadline.getTime();
}

/**
 * Fetch all MLB games for a specific ET date string (YYYYMMDD).
 */
export async function fetchGamesForDate(sport: string, dateStr: string): Promise<EspnGame[]> {
  const base = ESPN_ENDPOINTS[sport];
  if (!base) return [];

  const url = `${base}/scoreboard?dates=${dateStr}&limit=100`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json() as { events?: EspnEvent[] };
    return (data.events ?? []).map(parseGame);
  } catch {
    return [];
  }
}

/**
 * Fetch all MLB games for a full week (7 days, Mon–Sun ET).
 * Calls ESPN once per day in parallel.
 */
export async function fetchMlbWeekGames(espnDates: string[]): Promise<EspnGame[]> {
  const results = await Promise.all(espnDates.map(d => fetchGamesForDate("mlb", d)));
  // Deduplicate by game ID (same game can appear on multiple date endpoints near midnight)
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const dayGames of results) {
    for (const g of dayGames) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        games.push(g);
      }
    }
  }
  return games;
}

/**
 * Determine which teams won at least one game during the week.
 * Returns a Set of team IDs that won ≥1 game.
 */
export function getTeamsWithWin(games: EspnGame[]): Set<string> {
  const winners = new Set<string>();
  for (const g of games) {
    if (!g.isCompleted || g.homeScore == null || g.awayScore == null) continue;
    if (g.homeScore > g.awayScore) winners.add(g.homeTeam.id);
    else if (g.awayScore > g.homeScore) winners.add(g.awayTeam.id);
  }
  return winners;
}

// ---------------------------------------------------------------------------
// Pick lock helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a specific team's game has already started.
 * Returns true = picks are locked for this team this week.
 */
export async function isPickLocked(sport: string, teamId: string, week?: number): Promise<boolean> {
  const games = await fetchGames(sport, week);
  const game = games.find(g => g.homeTeam.id === teamId || g.awayTeam.id === teamId);
  if (!game) return false;
  return game.hasStarted;
}

/**
 * Check whether the MLB pick deadline has passed for the given pool week.
 */
export function isMlbPickDeadlinePassed(poolCreatedAt: Date, weekNumber: number): boolean {
  return getMlbWeekBounds(poolCreatedAt, weekNumber).deadlinePassed;
}

/**
 * Return map of teamId → true for every team whose game is final this week.
 */
export async function getCompletedGameResults(sport: string, week?: number): Promise<{ winners: string[]; losers: string[] }> {
  const games = await fetchGames(sport, week);
  const completed = games.filter(g => g.isCompleted);

  const winners: string[] = [];
  const losers: string[] = [];

  for (const g of completed) {
    if (g.homeScore == null || g.awayScore == null) continue;
    if (g.homeScore > g.awayScore) {
      winners.push(g.homeTeam.id);
      losers.push(g.awayTeam.id);
    } else if (g.awayScore > g.homeScore) {
      winners.push(g.awayTeam.id);
      losers.push(g.homeTeam.id);
    }
  }

  return { winners, losers };
}

/**
 * Fetch this week's schedule — used by commissioner panel and pick grid.
 */
export { fetchGames };
