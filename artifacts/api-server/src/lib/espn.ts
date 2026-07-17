const ESPN_ENDPOINTS: Record<string, string> = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
  mlb: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  nhl: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl",
  fifa: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world",
  worldcup: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world",
  // intl intentionally omitted — use fetchIntlGamesForDate() which merges multiple leagues
};

// Soccer league slugs for international matches:
// fifa.friendly = International friendlies / warm-up matches (ESPN public endpoint)
// fifa.world    = FIFA World Cup (active Jun 11 – Jul 19 2026)
const INTL_SOCCER_SLUGS = [
  "fifa.friendly",
  "fifa.world",
];


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
  status: "scheduled" | "in_progress" | "final" | "postponed" | "suspended";
  homeTeam: EspnTeam;
  awayTeam: EspnTeam;
  homeScore: number | null;
  awayScore: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  isCompleted: boolean;
  isPostponed: boolean;  // true when ESPN reports Postponed or Canceled
  hasStarted: boolean;
  liveState: EspnLiveState | null;
  homeStartingPitcher: EspnStartingPitcher | null;
  awayStartingPitcher: EspnStartingPitcher | null;
  groupLabel: string | null; // WC group (e.g. "Group A"), null for other sports
  /** ESPN season type: 1 = preseason, 2 = regular season, 3 = postseason. Defaults to 2 when ESPN omits the field. */
  seasonType: number;
  homeLinescores: { value: number; period: number }[];
  awayLinescores: { value: number; period: number }[];
}

type EspnProbable = {
  athlete?: {
    fullName?: string;
    shortName?: string;
  };
  statistics?: { name: string; displayValue: string }[];
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
  records?: { name: string; type: string; summary: string }[];
  linescores?: { value: number; period: number }[];
};

type EspnEvent = {
  id: string;
  date: string;
  /** ESPN response shape: { year: 2026, type: 1, slug: "preseason" }
   *  type is a plain number: 1 = preseason, 2 = regular season, 3 = postseason.
   *  slug is a sibling of type, not a child. */
  season?: { year?: number; type?: number; slug?: string };
  competitions?: {
    competitors?: EspnCompetitor[];
    status?: {
      period?: number;
      type?: { completed?: boolean; name?: string; state?: string; shortDetail?: string };
    };
    situation?: EspnSituation;
    notes?: { type?: string; headline?: string }[];
  }[];
};

function extractStartingPitcher(probable: EspnProbable | undefined): EspnStartingPitcher | null {
  if (!probable?.athlete?.fullName) return null;
  const stats = probable.statistics ?? [];
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
  if (wStat !== undefined) { const n = parseInt(wStat, 10); if (!isNaN(n)) wins = n; }
  if (lStat !== undefined) { const n = parseInt(lStat, 10); if (!isNaN(n)) losses = n; }
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
  const statusName = comp?.status?.type?.name ?? "";
  const isPostponed = /postponed|cancel/i.test(statusName);
  const isSuspended = /suspend/i.test(statusName);

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

  // Extract WC group label from competition notes (e.g. "Group A - Matchday 1" → "Group A")
  const noteHeadline = comp?.notes?.[0]?.headline ?? null;
  const groupMatch = noteHeadline?.match(/Group\s+[A-L]/i);
  const groupLabel = groupMatch ? groupMatch[0].replace(/\s+/g, " ") : null;

  return {
    id: event.id,
    date: event.date,
    status: isSuspended ? "suspended" : isPostponed ? "postponed" : isCompleted ? "final" : hasStarted ? "in_progress" : "scheduled",
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
    isPostponed: isPostponed || isSuspended,
    hasStarted,
    liveState,
    homeRecord: home?.records?.find(r => r.name === "overall" || r.type === "total")?.summary ?? null,
    awayRecord: away?.records?.find(r => r.name === "overall" || r.type === "total")?.summary ?? null,
    homeStartingPitcher: extractStartingPitcher(home?.probables?.[0]),
    awayStartingPitcher: extractStartingPitcher(away?.probables?.[0]),
    groupLabel,
    seasonType: event.season?.type ?? 2,
    homeLinescores: home?.linescores ?? [],
    awayLinescores: away?.linescores ?? [],
  };
}

async function fetchGames(sport: string, week?: number, season?: number): Promise<EspnGame[]> {
  const base = ESPN_ENDPOINTS[sport];
  if (!base) return [];

  const resolvedSeason = season ?? new Date().getFullYear();
  const url = sport === "nfl" && week
    ? `${base}/scoreboard?week=${week}&seasontype=2&season=${resolvedSeason}`
    : `${base}/scoreboard`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
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

// ---------------------------------------------------------------------------
// NHL week utilities (mirrors MLB — Mon-Sun calendar anchored to pool.createdAt)
// ---------------------------------------------------------------------------

/**
 * Returns the UTC timestamp of the Monday at midnight ET that is on or after
 * the given UTC date. Used to anchor the "first NHL week" for a pool.
 */
// Sandbox anchor: createdAt that places NHL Week 1 at the 2025-26 season opener (Oct 6–12, 2025).
// All NHL sandbox pools use this constant instead of pool.createdAt so that
// "Week 1" always means the first week of actual regular-season games.
export const NHL_SANDBOX_ANCHOR = new Date("2025-10-01T12:00:00Z");

export function getFirstNhlWeekMonday(poolCreatedAt: Date): Date {
  const etDate = asEtDate(poolCreatedAt);
  const dow = etDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = dow === 1 ? 0 : (8 - dow) % 7;
  const mondayEt = new Date(etDate);
  mondayEt.setUTCHours(0, 0, 0, 0);
  mondayEt.setUTCDate(mondayEt.getUTCDate() + daysToMonday);
  return fromEtDate(mondayEt); // UTC: Monday 04:00 UTC (EDT)
}

export interface NhlWeekBounds {
  /** UTC timestamp of Monday 00:00 ET for the week */
  weekStart: Date;
  /** UTC timestamp of Sunday 23:59:59 ET for the week */
  weekEnd: Date;
  /** Human-readable label e.g. "Oct 6 – Oct 12" */
  weekLabel: string;
  /** Array of ET date strings (YYYY-MM-DD) for each day Mon–Sun */
  days: string[];
  /** Array of YYYYMMDD formatted date strings for ESPN API calls */
  espnDates: string[];
}

/**
 * Compute bounds for the Nth NHL week of a pool.
 * Weeks run Monday–Sunday ET, anchored to pool.createdAt (same pattern as MLB).
 *
 * @param poolCreatedAt  pool.createdAt (UTC)
 * @param weekNumber     pool.currentWeek (1-indexed)
 */
export function getNhlWeekBounds(poolCreatedAt: Date, weekNumber: number): NhlWeekBounds {
  const firstMonday = getFirstNhlWeekMonday(poolCreatedAt);
  const weekStartUtc = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  const days: string[] = [];
  const espnDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(weekStartUtc.getTime() + i * 24 * 60 * 60 * 1000);
    days.push(formatDateEtDash(dayUtc));
    espnDates.push(formatDateEt(dayUtc));
  }

  // NHL regular-season slates run Saturday–Sunday; keep only those two days.
  // weekStart/weekEnd still span Mon–Sun for labelling and deadline purposes.
  const isWeekend = (yyyymmdd: string): boolean => {
    const dow = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8))).getUTCDay();
    return dow === 0 || dow === 6;
  };
  const filteredDays = days.filter((_, i) => isWeekend(espnDates[i]));
  const filteredEspnDates = espnDates.filter(isWeekend);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  const weekLabel = `${fmt.format(weekStartUtc)} – ${fmt.format(weekEndUtc)}`;

  return { weekStart: weekStartUtc, weekEnd: weekEndUtc, weekLabel, days: filteredDays, espnDates: filteredEspnDates };
}

/**
 * Fetch all NHL games for a full week (7 days, Mon–Sun ET).
 * Calls ESPN once per day in parallel and deduplicates by game ID.
 * Season is implicitly encoded in poolCreatedAt — never hardcoded.
 *
 * @param seasonType ESPN season type (1=preseason, 2=regular, 3=postseason). Defaults to 2.
 *   Pass 3 for a future playoff-bracket pool type without modifying this function.
 */
export async function fetchNhlGamesByWeek(poolCreatedAt: Date, weekNumber: number, seasonType = 2): Promise<EspnGame[]> {
  const { espnDates: rawEspnDates } = getNhlWeekBounds(poolCreatedAt, weekNumber);
  // getNhlWeekBounds already filters to Sat/Sun; filter again here defensively.
  const espnDates = rawEspnDates.filter(d => {
    const dow = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay();
    return dow === 0 || dow === 6;
  });
  const results = await Promise.all(espnDates.map(d => fetchGamesForDate("nhl", d, seasonType)));
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
  // Post-fetch filter: ESPN ignores &seasontype= on date-based endpoints, so we
  // enforce the season type here by inspecting the per-event e.season.type field
  // that parseGame now reads correctly (a plain number: 1=pre, 2=regular, 3=post).
  return games.filter(g => g.seasonType === seasonType);
}

// ---------------------------------------------------------------------------
// NBA week utilities (mirrors NHL — Mon-Sun calendar anchored to pool.createdAt)
// ---------------------------------------------------------------------------

// Sandbox anchor: createdAt that places NBA Week 1 at the 2025-26 opening night week (Oct 22–28, 2025).
// All NBA sandbox pools use this constant instead of pool.createdAt so that
// "Week 1" always means the first week of actual regular-season games.
export const NBA_SANDBOX_ANCHOR = new Date("2025-10-22T12:00:00Z");

export function getFirstNbaWeekMonday(poolCreatedAt: Date): Date {
  const etDate = asEtDate(poolCreatedAt);
  const dow = etDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = dow === 1 ? 0 : (8 - dow) % 7;
  const mondayEt = new Date(etDate);
  mondayEt.setUTCHours(0, 0, 0, 0);
  mondayEt.setUTCDate(mondayEt.getUTCDate() + daysToMonday);
  return fromEtDate(mondayEt); // UTC: Monday 04:00 UTC (EDT)
}

export interface NbaWeekBounds {
  /** UTC timestamp of Monday 00:00 ET for the week */
  weekStart: Date;
  /** UTC timestamp of Sunday 23:59:59 ET for the week */
  weekEnd: Date;
  /** Human-readable label e.g. "Oct 22 – Oct 28" */
  weekLabel: string;
  /** Array of ET date strings (YYYY-MM-DD) for each day Mon–Sun */
  days: string[];
  /** Array of YYYYMMDD formatted date strings for ESPN API calls */
  espnDates: string[];
}

/**
 * Compute bounds for the Nth NBA week of a pool.
 * Weeks run Monday–Sunday ET, anchored to pool.createdAt (same pattern as NHL/MLB).
 * No day-of-week filtering — NBA plays most nights.
 *
 * @param poolCreatedAt  pool.createdAt (UTC)
 * @param weekNumber     pool.currentWeek (1-indexed)
 */
export function getNbaWeekBounds(poolCreatedAt: Date, weekNumber: number): NbaWeekBounds {
  const firstMonday = getFirstNbaWeekMonday(poolCreatedAt);
  const weekStartUtc = new Date(firstMonday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

  const days: string[] = [];
  const espnDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayUtc = new Date(weekStartUtc.getTime() + i * 24 * 60 * 60 * 1000);
    days.push(formatDateEtDash(dayUtc));
    espnDates.push(formatDateEt(dayUtc));
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  const weekLabel = `${fmt.format(weekStartUtc)} – ${fmt.format(weekEndUtc)}`;

  return { weekStart: weekStartUtc, weekEnd: weekEndUtc, weekLabel, days, espnDates };
}

/**
 * Fetch all NBA games for a full week (7 days, Mon–Sun ET).
 * Calls ESPN once per day in parallel and deduplicates by game ID.
 * Season is implicitly encoded in poolCreatedAt — never hardcoded.
 *
 * @param seasonType ESPN season type (1=preseason, 2=regular, 3=postseason). Defaults to 2.
 */
export async function fetchNbaGamesByWeek(poolCreatedAt: Date, weekNumber: number, seasonType = 2): Promise<EspnGame[]> {
  const { espnDates } = getNbaWeekBounds(poolCreatedAt, weekNumber);
  const results = await Promise.all(espnDates.map(d => fetchGamesForDate("nba", d, seasonType)));
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
  // Post-fetch filter: ESPN ignores &seasontype= on date-based endpoints, so we
  // enforce the season type here by inspecting the per-event e.season.type field.
  return games.filter(g => g.seasonType === seasonType);
}

/**
 * Return the "current slate date" as YYYY-MM-DD in ET (America/New_York).
 * The slate rolls over at 5 AM ET, not midnight, so that games finishing
 * after midnight still belong to the previous day's slate.
 */
export function getTodayEtDate(): string {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() - FIVE_HOURS_MS);
  return shifted.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
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
 * Fetch international soccer games for a specific ET date (YYYYMMDD).
 * Merges ESPN fifa.friendly (pre-WC warm-ups / ongoing friendlies) with
 * fifa.world (active during the FIFA World Cup), then deduplicates.
 */
export async function fetchIntlGamesForDate(dateStr: string): Promise<EspnGame[]> {
  const allResults = await Promise.all(
    INTL_SOCCER_SLUGS.map((slug) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStr}&limit=50`;
      return fetch(url, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((d: any) => ((d.events ?? []) as any[]).map(parseGame))
        .catch((): EspnGame[] => []);
    }),
  );
  const seen = new Set<string>();
  const games: EspnGame[] = [];
  for (const dayGames of allResults) {
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
 * Fetch games for a specific sport and ET date string (YYYYMMDD).
 *
 * @param seasonType ESPN season type filter (1=preseason, 2=regular, 3=postseason). Defaults to 2.
 *   Pass 3 for a future playoff-bracket pool without modifying callers.
 *   Note: some ESPN sport endpoints ignore this parameter (e.g. MLB returns the same games regardless).
 */
export async function fetchGamesForDate(sport: string, dateStr: string, seasonType = 2): Promise<EspnGame[]> {
  const base = ESPN_ENDPOINTS[sport];
  if (!base) return [];

  const url = `${base}/scoreboard?dates=${dateStr}&seasontype=${seasonType}&limit=100`;
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
 * Fetch all NFL games for a given regular-season week (1-18).
 * Uses ESPN's week-based scoreboard endpoint. Pass the pool's season year so
 * the correct season is queried (e.g. 2025 for a 2025-season pool).
 */
export async function fetchNflGamesByWeek(week: number, season?: number): Promise<EspnGame[]> {
  return fetchGames("nfl", week, season);
}

/**
 * Fetch all MLB games for a full week (7 days, Mon–Sun ET).
 * Calls ESPN once per day in parallel.
 *
 * @param seasonType ESPN season type (1=preseason, 2=regular, 3=postseason). Defaults to 2.
 *   Note: the ESPN MLB scoreboard endpoint currently ignores this parameter and returns all games.
 */
export async function fetchMlbWeekGames(espnDates: string[], seasonType = 2): Promise<EspnGame[]> {
  const results = await Promise.all(espnDates.map(d => fetchGamesForDate("mlb", d, seasonType)));
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
 *
 * For NHL pools, pass poolCreatedAt so the check covers the full
 * Mon-Sun week rather than just today's live scoreboard.
 */
export async function isPickLocked(sport: string, teamId: string, week?: number, poolCreatedAt?: Date): Promise<boolean> {
  let games: EspnGame[];
  if (sport === "nhl" && poolCreatedAt != null && week != null) {
    games = await fetchNhlGamesByWeek(poolCreatedAt, week);
  } else {
    games = await fetchGames(sport, week);
  }
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
 *
 * For NHL pools, pass poolCreatedAt so the check covers the full
 * Mon-Sun week rather than just today's live scoreboard.
 */
export async function getCompletedGameResults(sport: string, week?: number, poolCreatedAt?: Date): Promise<{ winners: string[]; losers: string[] }> {
  let games: EspnGame[];
  if (sport === "nhl" && poolCreatedAt != null && week != null) {
    games = await fetchNhlGamesByWeek(poolCreatedAt, week);
  } else {
    games = await fetchGames(sport, week);
  }
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
 * Returns a map of teamId → signed margin for every completed game this week.
 * Positive  = the team won by that many points (e.g. +7 means won by 7).
 * Negative  = the team lost by that many points (e.g. -7 means lost by 7).
 * Teams in games that are not yet final are omitted.
 *
 * For NHL pools, pass poolCreatedAt so the check covers the full
 * Mon-Sun week rather than just today's live scoreboard.
 */
export async function getGameMarginsByTeam(sport: string, week?: number, poolCreatedAt?: Date): Promise<Map<string, number>> {
  let games: EspnGame[];
  if (sport === "nhl" && poolCreatedAt != null && week != null) {
    games = await fetchNhlGamesByWeek(poolCreatedAt, week);
  } else {
    games = await fetchGames(sport, week);
  }
  const marginByTeamId = new Map<string, number>();
  for (const g of games) {
    if (!g.isCompleted || g.homeScore == null || g.awayScore == null) continue;
    const diff = g.homeScore - g.awayScore; // positive → home won
    marginByTeamId.set(g.homeTeam.id, diff);
    marginByTeamId.set(g.awayTeam.id, -diff);
  }
  return marginByTeamId;
}

/**
 * Fetch this week's schedule — used by commissioner panel and pick grid.
 */
export { fetchGames };

// ---------------------------------------------------------------------------
// NFL Division Standings — live division records from ESPN
// https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3
// Returns 2 conferences → 4 divisions each → 4 teams each.
// 5-minute in-memory cache with stale-on-error fallback (mirrors wc.ts pattern).
// ---------------------------------------------------------------------------

export interface NflDivisionStandingsTeam {
  id: string;
  displayName: string;
  abbreviation: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  winPercent: string;      // e.g. ".824" or "—"
  gamesBehind: string;     // e.g. "-" (leader) or "2"
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  playoffSeed: number;
  divisionRecord: string;  // e.g. "4-2-0"
  streak: string;          // e.g. "W3" or "L1"
  clincher: string | null; // "z" division | "x" playoff | "y" conf | "e" eliminated | null
}

export interface NflDivisionStandingsGroup {
  divisionName: string;    // e.g. "AFC East"
  teams: NflDivisionStandingsTeam[];
}

const NFL_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3";
const NFL_STANDINGS_TTL_MS = 5 * 60 * 1000; // 5 min

let _nflStandingsCache: { data: NflDivisionStandingsGroup[]; fetchedAt: number } | null = null;

/**
 * Fetch and cache NFL division standings from ESPN.
 * Teams are sorted by playoff seed (1 = leader).
 * Falls back to stale cache if ESPN is unreachable.
 */
export async function fetchNflDivisionStandings(): Promise<NflDivisionStandingsGroup[]> {
  const now = Date.now();
  if (_nflStandingsCache && now - _nflStandingsCache.fetchedAt < NFL_STANDINGS_TTL_MS) {
    return _nflStandingsCache.data;
  }

  try {
    const res = await fetch(NFL_STANDINGS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`ESPN NFL standings HTTP ${res.status}`);

    const raw = await res.json() as {
      children?: Array<{
        name: string;
        children?: Array<{
          name: string;
          standings?: {
            entries?: Array<{
              team: { id: string; displayName: string; abbreviation: string; logos?: { href: string }[] };
              stats?: Array<{ name: string; displayValue: string; value?: number }>;
            }>;
          };
        }>;
      }>;
    };

    const getStat = (
      stats: Array<{ name: string; displayValue: string; value?: number }> | undefined,
      name: string,
    ) => stats?.find(s => s.name === name);

    const groups: NflDivisionStandingsGroup[] = [];

    for (const conf of raw.children ?? []) {
      for (const div of conf.children ?? []) {
        const entries = div.standings?.entries ?? [];
        const teams: NflDivisionStandingsTeam[] = entries.map(e => {
          const st = e.stats ?? [];
          const clinchRaw = getStat(st, "clincher")?.displayValue ?? "";
          return {
            id: e.team.id,
            displayName: e.team.displayName,
            abbreviation: e.team.abbreviation,
            logo: e.team.logos?.[0]?.href ?? null,
            wins: getStat(st, "wins")?.value ?? 0,
            losses: getStat(st, "losses")?.value ?? 0,
            ties: getStat(st, "ties")?.value ?? 0,
            winPercent: getStat(st, "winPercent")?.displayValue ?? ".000",
            gamesBehind: getStat(st, "gamesBehind")?.displayValue ?? "-",
            pointsFor: getStat(st, "pointsFor")?.value ?? 0,
            pointsAgainst: getStat(st, "pointsAgainst")?.value ?? 0,
            pointDifferential: getStat(st, "pointDifferential")?.value ?? 0,
            playoffSeed: getStat(st, "playoffSeed")?.value ?? 99,
            divisionRecord: getStat(st, "divisionRecord")?.displayValue ?? "0-0-0",
            streak: getStat(st, "streak")?.displayValue ?? "-",
            clincher: clinchRaw.trim() !== "" ? clinchRaw.trim() : null,
          };
        });

        // Sort by playoff seed ascending (ESPN usually returns them pre-sorted, but be safe)
        teams.sort((a, b) => a.playoffSeed - b.playoffSeed);

        groups.push({ divisionName: div.name, teams });
      }
    }

    _nflStandingsCache = { data: groups, fetchedAt: now };
    return groups;
  } catch {
    // Stale-on-error fallback
    if (_nflStandingsCache) return _nflStandingsCache.data;
    return [];
  }
}

// ---------------------------------------------------------------------------
// NFL Week 18 tiebreaker stats
// ---------------------------------------------------------------------------

const NFL_SUMMARY_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

/**
 * Fetch combined passing + rushing yards across multiple completed NFL games.
 * Calls the ESPN summary (boxscore) endpoint for each game ID in parallel and
 * sums both teams' stats. Returns null if ESPN data is unavailable for all
 * games (soft failure — caller should skip writing actuals).
 */
export async function fetchNflWeek18TiebreakerStats(
  gameIds: string[]
): Promise<{ actualPassingYards: number; actualRushingYards: number } | null> {
  if (gameIds.length === 0) return null;

  const results = await Promise.allSettled(
    gameIds.map(async (id) => {
      const res = await fetch(`${NFL_SUMMARY_BASE}?event=${id}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        boxscore?: {
          teams?: Array<{
            statistics?: Array<{ name: string; displayValue: string }>;
          }>;
        };
      };
    })
  );

  let totalPassing = 0;
  let totalRushing = 0;
  let passingFound = false;
  let rushingFound = false;

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const teams = result.value.boxscore?.teams ?? [];
    for (const team of teams) {
      // Accumulate one passing value per team to avoid double-counting when ESPN
      // returns both "passingYards" and "netPassingYards" in the same team object.
      // Prefer "netPassingYards" (passing yards minus sack yards, the standard NFL
      // tiebreaker figure); fall back to "passingYards" only when net is absent.
      let teamPassing: number | null = null;
      let teamRushing: number | null = null;
      for (const stat of team.statistics ?? []) {
        if (stat.name === "netPassingYards") {
          const v = parseInt(stat.displayValue, 10);
          if (!isNaN(v)) teamPassing = v;
        } else if (stat.name === "passingYards" && teamPassing === null) {
          const v = parseInt(stat.displayValue, 10);
          if (!isNaN(v)) teamPassing = v;
        }
        if (stat.name === "rushingYards") {
          const v = parseInt(stat.displayValue, 10);
          if (!isNaN(v)) teamRushing = v;
        }
      }
      if (teamPassing !== null) { totalPassing += teamPassing; passingFound = true; }
      if (teamRushing !== null) { totalRushing += teamRushing; rushingFound = true; }
    }
  }

  if (!passingFound && !rushingFound) return null;
  return {
    actualPassingYards: passingFound ? totalPassing : 0,
    actualRushingYards: rushingFound ? totalRushing : 0,
  };
}
