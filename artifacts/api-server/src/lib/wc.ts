/**
 * World Cup 2026 data module.
 *
 * Schedule source : openfootball worldcup.json (no key required, 1-h cache)
 * Live scores     : ESPN public soccer API       (no key required, 60-sec cache)
 *
 * Live scores are optional — if ESPN is unreachable the schedule still
 * works; games simply stay "scheduled" until openfootball publishes results.
 */
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// WC 2026 phase windows (dates are YYYY-MM-DD ET)
// ---------------------------------------------------------------------------
export const WC_PHASES = {
  group_stage:    { start: "2026-06-11", end: "2026-06-27" },
  knockout_stage: { start: "2026-07-03", end: "2026-07-19" },
} as const;
export type WcPhase = keyof typeof WC_PHASES;

export function getWcPhase(dateStr: string): WcPhase | null {
  if (dateStr >= WC_PHASES.group_stage.start && dateStr <= WC_PHASES.group_stage.end) return "group_stage";
  if (dateStr >= WC_PHASES.knockout_stage.start && dateStr <= WC_PHASES.knockout_stage.end) return "knockout_stage";
  return null;
}

// ---------------------------------------------------------------------------
// WcGame — the normalized game type used throughout the pick-em stack
// ---------------------------------------------------------------------------
export interface WcTeam {
  id: string;            // slug-based stable ID
  displayName: string;
  abbreviation: string;
  logo: string | null;   // flag CDN URL or null
}

export interface WcGame {
  id: string;            // "wc2026_{date}_{homeSlug}_{awaySlug}"
  date: string;          // ISO UTC timestamp
  status: "scheduled" | "in_progress" | "final";
  homeTeam: WcTeam;
  awayTeam: WcTeam;
  homeScore: number | null;
  awayScore: number | null;
  groupLabel: string | null;  // "Group A" – "Group L" or null for knockout
  liveDetail: string | null;  // e.g. "45'" for in-progress
  isCompleted: boolean;
  hasStarted: boolean;
}

export interface WcScheduleDay {
  dateStr: string;  // YYYY-MM-DD
  label: string;    // "Thursday, June 11"
  games: WcGame[];
}

// ---------------------------------------------------------------------------
// Static team metadata for all 48 WC 2026 teams
// espnSlug → slug used in https://a.espncdn.com/i/teamlogos/countries/500/{espnSlug}.png
// Most match abbr.toLowerCase(); exceptions: DR Congo = "rdc", South Korea = "kors"
// ---------------------------------------------------------------------------
interface TeamMeta { abbr: string; espnSlug: string; slug: string }

const TEAM_META: Record<string, TeamMeta> = {
  "Algeria":               { abbr: "ALG", espnSlug: "alg",  slug: "algeria" },
  "Argentina":             { abbr: "ARG", espnSlug: "arg",  slug: "argentina" },
  "Australia":             { abbr: "AUS", espnSlug: "aus",  slug: "australia" },
  "Austria":               { abbr: "AUT", espnSlug: "aut",  slug: "austria" },
  "Belgium":               { abbr: "BEL", espnSlug: "bel",  slug: "belgium" },
  "Bosnia & Herzegovina":  { abbr: "BIH", espnSlug: "bih",  slug: "bosnia_herzegovina" },
  "Brazil":                { abbr: "BRA", espnSlug: "bra",  slug: "brazil" },
  "Canada":                { abbr: "CAN", espnSlug: "can",  slug: "canada" },
  "Cape Verde":            { abbr: "CPV", espnSlug: "cpv",  slug: "cape_verde" },
  "Colombia":              { abbr: "COL", espnSlug: "col",  slug: "colombia" },
  "Croatia":               { abbr: "CRO", espnSlug: "cro",  slug: "croatia" },
  "Curaçao":               { abbr: "CUW", espnSlug: "",     slug: "curacao" },
  "Czech Republic":        { abbr: "CZE", espnSlug: "cze",  slug: "czech_republic" },
  "DR Congo":              { abbr: "COD", espnSlug: "rdc",  slug: "dr_congo" },
  "Ecuador":               { abbr: "ECU", espnSlug: "ecu",  slug: "ecuador" },
  "Egypt":                 { abbr: "EGY", espnSlug: "egy",  slug: "egypt" },
  "England":               { abbr: "ENG", espnSlug: "eng",  slug: "england" },
  "France":                { abbr: "FRA", espnSlug: "fra",  slug: "france" },
  "Germany":               { abbr: "GER", espnSlug: "ger",  slug: "germany" },
  "Ghana":                 { abbr: "GHA", espnSlug: "gha",  slug: "ghana" },
  "Haiti":                 { abbr: "HAI", espnSlug: "hai",  slug: "haiti" },
  "Iran":                  { abbr: "IRN", espnSlug: "irn",  slug: "iran" },
  "Iraq":                  { abbr: "IRQ", espnSlug: "irq",  slug: "iraq" },
  "Ivory Coast":           { abbr: "CIV", espnSlug: "civ",  slug: "ivory_coast" },
  "Japan":                 { abbr: "JPN", espnSlug: "jpn",  slug: "japan" },
  "Jordan":                { abbr: "JOR", espnSlug: "jor",  slug: "jordan" },
  "Mexico":                { abbr: "MEX", espnSlug: "mex",  slug: "mexico" },
  "Morocco":               { abbr: "MAR", espnSlug: "mar",  slug: "morocco" },
  "Netherlands":           { abbr: "NED", espnSlug: "ned",  slug: "netherlands" },
  "New Zealand":           { abbr: "NZL", espnSlug: "nzl",  slug: "new_zealand" },
  "Norway":                { abbr: "NOR", espnSlug: "nor",  slug: "norway" },
  "Panama":                { abbr: "PAN", espnSlug: "pan",  slug: "panama" },
  "Paraguay":              { abbr: "PAR", espnSlug: "par",  slug: "paraguay" },
  "Portugal":              { abbr: "POR", espnSlug: "por",  slug: "portugal" },
  "Qatar":                 { abbr: "QAT", espnSlug: "qat",  slug: "qatar" },
  "Saudi Arabia":          { abbr: "KSA", espnSlug: "ksa",  slug: "saudi_arabia" },
  "Scotland":              { abbr: "SCO", espnSlug: "sco",  slug: "scotland" },
  "Senegal":               { abbr: "SEN", espnSlug: "sen",  slug: "senegal" },
  "South Africa":          { abbr: "RSA", espnSlug: "rsa",  slug: "south_africa" },
  "South Korea":           { abbr: "KOR", espnSlug: "kors", slug: "south_korea" },
  "Spain":                 { abbr: "ESP", espnSlug: "esp",  slug: "spain" },
  "Sweden":                { abbr: "SWE", espnSlug: "swe",  slug: "sweden" },
  "Switzerland":           { abbr: "SUI", espnSlug: "sui",  slug: "switzerland" },
  "Tunisia":               { abbr: "TUN", espnSlug: "tun",  slug: "tunisia" },
  "Turkey":                { abbr: "TUR", espnSlug: "tur",  slug: "turkey" },
  "USA":                   { abbr: "USA", espnSlug: "usa",  slug: "usa" },
  "Uruguay":               { abbr: "URU", espnSlug: "uru",  slug: "uruguay" },
  "Uzbekistan":            { abbr: "UZB", espnSlug: "uzb",  slug: "uzbekistan" },
};

// Aliases: API-Football / alternate spellings → canonical openfootball name
const TEAM_ALIASES: Record<string, string> = {
  "czechia":             "Czech Republic",
  "côte d'ivoire":       "Ivory Coast",
  "cote d'ivoire":       "Ivory Coast",
  "congo dr":            "DR Congo",
  "democratic republic of congo": "DR Congo",
  "bosnia":              "Bosnia & Herzegovina",
  "curacao":             "Curaçao",
  "united states":       "USA",
  "us":                  "USA",
  "republic of ireland": "Ireland",
  "korea republic":      "South Korea",
};

function resolveTeamName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return TEAM_ALIASES[lower] ?? raw.trim();
}

function teamMeta(name: string): TeamMeta {
  const resolved = resolveTeamName(name);
  return TEAM_META[resolved] ?? {
    abbr: resolved.slice(0, 3).toUpperCase(),
    flagCode: "",
    slug: resolved.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  };
}

function crestUrl(espnSlug: string): string | null {
  if (!espnSlug) return null;
  return `https://a.espncdn.com/i/teamlogos/countries/500/${espnSlug}.png`;
}

function buildTeam(name: string): WcTeam {
  const resolved = resolveTeamName(name);
  const meta = teamMeta(resolved);
  return {
    id: meta.slug,
    displayName: resolved,
    abbreviation: meta.abbr,
    logo: crestUrl(meta.espnSlug),
  };
}

// ---------------------------------------------------------------------------
// Time parsing: "13:00 UTC-6" → ISO UTC timestamp on a given YYYY-MM-DD
// ---------------------------------------------------------------------------
function parseKickoffIso(date: string, timeStr: string): string {
  // timeStr format: "HH:MM UTC±N" e.g. "13:00 UTC-6" or "20:00 UTC+0"
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d+)$/);
  if (!m) {
    // Fallback: noon UTC
    return `${date}T12:00:00Z`;
  }
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const offsetHours = parseInt(m[3], 10); // negative = behind UTC
  // UTC = local – offset  (UTC-6 means local - (-6) = local + 6)
  const utcMinutes = h * 60 + min - offsetHours * 60;
  const utcH = Math.floor(((utcMinutes % 1440) + 1440) % 1440 / 60);
  const utcMin = ((utcMinutes % 60) + 60) % 60;
  const dayOffset = Math.floor(utcMinutes / 1440);
  const baseDate = new Date(`${date}T00:00:00Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  const d = baseDate.toISOString().slice(0, 10);
  return `${d}T${String(utcH).padStart(2, "0")}:${String(utcMin).padStart(2, "0")}:00Z`;
}

// stable game ID from date + team slugs
function makeGameId(date: string, homeSlug: string, awaySlug: string): string {
  return `wc2026_${date}_${homeSlug}_vs_${awaySlug}`;
}

// ---------------------------------------------------------------------------
// openfootball JSON shape
// ---------------------------------------------------------------------------
interface OFMatch {
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  group?: string;
  ground?: string;
  score?: { ft?: number[] };  // final score [team1, team2] if published
}
interface OFData {
  name?: string;
  matches?: OFMatch[];
}

// ---------------------------------------------------------------------------
// Schedule cache (openfootball) — 1 hour TTL (data rarely changes)
// ---------------------------------------------------------------------------
const OF_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const SCHEDULE_TTL_MS = 60 * 60 * 1000;

let _scheduleCache: { data: WcScheduleDay[]; fetchedAt: number } | null = null;

async function fetchOpenfootballSchedule(): Promise<WcScheduleDay[]> {
  const now = Date.now();
  if (_scheduleCache && now - _scheduleCache.fetchedAt < SCHEDULE_TTL_MS) {
    return _scheduleCache.data;
  }

  try {
    const res = await fetch(OF_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`openfootball HTTP ${res.status}`);
    const raw = await res.json() as OFData;
    const matches = raw.matches ?? [];

    // Group stage only: those with a group field
    const gsMatches = matches.filter((m) => m.group && m.date && m.team1 && m.team2);

    // Group by date
    const byDate = new Map<string, OFMatch[]>();
    for (const m of gsMatches) {
      const d = m.date!;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(m);
    }

    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const days: WcScheduleDay[] = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, dayMatches]) => {
        const dateUtc = new Date(`${dateStr}T16:00:00Z`);
        const label = fmt.format(dateUtc);

        const games: WcGame[] = dayMatches.map((m) => {
          const homeTeam = buildTeam(m.team1!);
          const awayTeam = buildTeam(m.team2!);
          const iso = parseKickoffIso(dateStr, m.time ?? "12:00 UTC+0");
          const id = makeGameId(dateStr, homeTeam.id, awayTeam.id);

          // openfootball publishes final scores in score.ft
          const homeScore = m.score?.ft?.[0] ?? null;
          const awayScore = m.score?.ft?.[1] ?? null;
          const isCompleted = homeScore !== null && awayScore !== null;

          return {
            id,
            date: iso,
            status: isCompleted ? "final" : "scheduled",
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            groupLabel: m.group ?? null,
            liveDetail: null,
            isCompleted,
            hasStarted: isCompleted,
          };
        });

        // Sort games within a day by kick-off time
        games.sort((a, b) => a.date.localeCompare(b.date));

        return { dateStr, label, games };
      });

    _scheduleCache = { data: days, fetchedAt: now };
    return days;
  } catch (err) {
    logger.warn({ err }, "wc: failed to fetch openfootball schedule");
    // Return cached (possibly stale) rather than empty
    return _scheduleCache?.data ?? [];
  }
}

// ---------------------------------------------------------------------------
// ESPN live scores — public API, no key required
// https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
// Used only to overlay live/final scores on top of the openfootball schedule.
// ---------------------------------------------------------------------------
const ESPN_WC_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const LIVE_TTL_MS = 60 * 1000; // 60 seconds during matches

interface LiveScore {
  homeScore: number | null;
  awayScore: number | null;
  status: "in_progress" | "final";
  liveDetail: string | null;
}

// Keyed by normalised "{homeName}|{awayName}"
type LiveScoreMap = Map<string, LiveScore>;

let _liveCache: { map: LiveScoreMap; date: string; fetchedAt: number } | null = null;

function normalizeForMatch(name: string): string {
  return resolveTeamName(name).toLowerCase().replace(/[^a-z]/g, "");
}

function liveKey(home: string, away: string): string {
  return `${normalizeForMatch(home)}|${normalizeForMatch(away)}`;
}

interface EspnScoreboardEvent {
  id: string;
  date: string;
  competitions?: {
    competitors?: { homeAway: string; score?: string; team: { displayName: string } }[];
    status?: { type?: { completed?: boolean; state?: string; shortDetail?: string } };
  }[];
}

async function fetchEspnLiveScores(todayEt: string): Promise<LiveScoreMap> {
  const now = Date.now();
  if (_liveCache && _liveCache.date === todayEt && now - _liveCache.fetchedAt < LIVE_TTL_MS) {
    return _liveCache.map;
  }

  // Convert YYYY-MM-DD → YYYYMMDD for ESPN
  const espnDate = todayEt.replace(/-/g, "");
  const url = `${ESPN_WC_BASE}/scoreboard?dates=${espnDate}&limit=100`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      logger.warn({ status: res.status }, "wc: ESPN scoreboard HTTP error");
      return _liveCache?.map ?? new Map();
    }
    const data = await res.json() as { events?: EspnScoreboardEvent[] };
    const map: LiveScoreMap = new Map();

    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      const statusType = comp.status?.type;
      const state = statusType?.state ?? "pre";
      const completed = statusType?.completed ?? false;

      // Only overlay in-progress or completed games — skip pre-game
      if (state === "pre" && !completed) continue;

      const gameStatus: "in_progress" | "final" = completed || state === "post"
        ? "final"
        : "in_progress";

      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const homeScore = home.score != null ? parseInt(home.score, 10) : null;
      const awayScore = away.score != null ? parseInt(away.score, 10) : null;
      const shortDetail = statusType?.shortDetail ?? null;
      const liveDetail = gameStatus === "in_progress" ? shortDetail : null;

      const k = liveKey(home.team.displayName, away.team.displayName);
      map.set(k, { homeScore, awayScore, status: gameStatus, liveDetail });
    }

    _liveCache = { map, date: todayEt, fetchedAt: now };
    return map;
  } catch (err) {
    logger.warn({ err }, "wc: failed to fetch ESPN live scores");
    return _liveCache?.map ?? new Map();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function getTodayEtDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/New_York" });
}

/**
 * Return the full WC Group Stage schedule with live scores overlaid.
 * This is the single function called by the /wc-schedule route and
 * the picks POST handler for game validation.
 */
export async function fetchWcSchedule(): Promise<WcScheduleDay[]> {
  const todayEt = getTodayEtDate();
  const [days, liveScores] = await Promise.all([
    fetchOpenfootballSchedule(),
    fetchEspnLiveScores(todayEt),
  ]);

  if (liveScores.size === 0) return days;

  // Overlay live scores onto today's games
  return days.map((day) => {
    if (day.dateStr !== todayEt) return day;
    const games = day.games.map((g) => {
      const k = liveKey(g.homeTeam.displayName, g.awayTeam.displayName);
      const live = liveScores.get(k);
      if (!live) return g;
      return {
        ...g,
        status: live.status,
        homeScore: live.homeScore,
        awayScore: live.awayScore,
        liveDetail: live.liveDetail,
        isCompleted: live.status === "final",
        hasStarted: true,
      };
    });
    return { ...day, games };
  });
}

/**
 * Fetch today's WC games for the auto-grader (completed games only).
 * Returns an EspnGame-compatible shape so the auto-eliminator needs
 * minimal changes.
 */
export async function fetchTodayWcGames(): Promise<WcGame[]> {
  const todayEt = getTodayEtDate();
  const days = await fetchWcSchedule();
  return days.find((d) => d.dateStr === todayEt)?.games ?? [];
}

/**
 * Fetch WC games for a specific ET date (YYYY-MM-DD).
 * Used to also check yesterday for games that finished after midnight ET.
 */
export async function fetchWcGamesForDate(dateStr: string): Promise<WcGame[]> {
  const days = await fetchWcSchedule();
  return days.find((d) => d.dateStr === dateStr)?.games ?? [];
}

/** Current WC phase based on today's ET date. */
export function getCurrentWcPhase(): WcPhase | null {
  return getWcPhase(getTodayEtDate());
}

/** 3-way match outcome from a completed WcGame. */
export function wcOutcome(g: WcGame): "home_win" | "draw" | "away_win" | null {
  if (!g.isCompleted || g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore > g.awayScore) return "home_win";
  if (g.awayScore > g.homeScore) return "away_win";
  return "draw";
}

// ---------------------------------------------------------------------------
// ESPN Standings API — live group definitions + standings
// https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings
// Single source of truth for GSP group/team data; 5-minute cache.
// ---------------------------------------------------------------------------

interface EspnStandingsTeamRaw {
  id: string;
  displayName: string;
  abbreviation: string;
  logos?: { href: string }[];
}

interface EspnStatRaw {
  name: string;
  displayValue: string;
  value?: number;
}

interface EspnStandingsEntryRaw {
  team: EspnStandingsTeamRaw;
  note?: { rank?: number };
  stats?: EspnStatRaw[];
}

interface EspnStandingsGroupRaw {
  name: string;
  standings: { entries: EspnStandingsEntryRaw[] };
}

interface EspnStandingsResponseRaw {
  children?: EspnStandingsGroupRaw[];
}

export interface WcStandingsTeam {
  id: string;
  displayName: string;
  abbreviation: string;
  logo: string | null;
  rank: number; // 1–4 current standing position
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface WcStandingsGroup {
  groupLetter: string; // "A" – "L"
  displayName: string; // "Group A"
  teams: WcStandingsTeam[]; // 4 teams sorted by rank asc
}

const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";
const STANDINGS_TTL_MS = 5 * 60 * 1000; // 5 min

let _standingsCache: { data: WcStandingsGroup[]; fetchedAt: number } | null = null;

/**
 * Fetch and cache WC 2026 group definitions + live standings from ESPN.
 * This is the single source of truth for GSP group/team data.
 * Teams are sorted by their current standing rank (1 = leading).
 * Falls back to stale cache if ESPN is unreachable.
 */
export async function fetchWcStandings(): Promise<WcStandingsGroup[]> {
  const now = Date.now();
  if (_standingsCache && now - _standingsCache.fetchedAt < STANDINGS_TTL_MS) {
    return _standingsCache.data;
  }
  try {
    const res = await fetch(ESPN_STANDINGS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`ESPN standings HTTP ${res.status}`);
    const data = await res.json() as EspnStandingsResponseRaw;

    const getStat = (stats: EspnStatRaw[] | undefined, ...names: string[]): number => {
      if (!stats) return 0;
      for (const name of names) {
        const s = stats.find((s) => s.name === name);
        if (s != null) return s.value ?? (parseInt(s.displayValue, 10) || 0);
      }
      return 0;
    };

    const groups: WcStandingsGroup[] = (data.children ?? []).map((child) => {
      const teams: WcStandingsTeam[] = child.standings.entries.map((e) => {
        const st = e.stats;
        return {
          id: e.team.id,
          displayName: e.team.displayName,
          abbreviation: e.team.abbreviation,
          logo: e.team.logos?.[0]?.href ?? null,
          rank: e.note?.rank ?? 99,
          played:  getStat(st, "gamesPlayed", "played"),
          wins:    getStat(st, "wins"),
          draws:   getStat(st, "ties", "draws"),
          losses:  getStat(st, "losses"),
          gf:      getStat(st, "pointsFor", "goalsFor"),
          ga:      getStat(st, "pointsAgainst", "goalsAgainst"),
          gd:      getStat(st, "pointDifferential", "goalDifference"),
          points:  getStat(st, "points"),
        };
      });
      teams.sort((a, b) => a.rank - b.rank);
      const groupLetter = child.name.replace(/^Group\s+/, "");
      return { groupLetter, displayName: child.name, teams };
    });

    groups.sort((a, b) => a.groupLetter.localeCompare(b.groupLetter));
    _standingsCache = { data: groups, fetchedAt: now };
    logger.info({ count: groups.length }, "wc: refreshed ESPN standings cache");
    return groups;
  } catch (err) {
    logger.warn({ err }, "wc: failed to fetch ESPN standings, using stale cache");
    return _standingsCache?.data ?? [];
  }
}

// ---------------------------------------------------------------------------
// WC 2026 Group Stage — static group definitions
// Source: FIFA World Cup 2026 draw, Miami, December 5, 2024
// Team names match the canonical keys in TEAM_META above.
// ---------------------------------------------------------------------------
export interface WcGroup {
  name: string;
  teams: [string, string, string, string];
}

export const WC_2026_GROUPS: WcGroup[] = [
  { name: "A", teams: ["USA",       "Panama",   "Uruguay",        "South Africa"] },
  { name: "B", teams: ["Canada",    "Morocco",  "Czech Republic", "Norway"      ] },
  { name: "C", teams: ["Mexico",    "Curaçao",  "Spain",          "Algeria"     ] },
  { name: "D", teams: ["Argentina", "Australia","England",        "Ghana"       ] },
  { name: "E", teams: ["France",    "Colombia", "Egypt",          "Japan"       ] },
  { name: "F", teams: ["Germany",   "Brazil",   "Netherlands",    "Ecuador"     ] },
  { name: "G", teams: ["Portugal",  "Belgium",  "South Korea",    "Tunisia"     ] },
  { name: "H", teams: ["Spain",     "Croatia",  "Saudi Arabia",   "DR Congo"   ] },
  { name: "I", teams: ["England",   "Senegal",  "Switzerland",    "Iran"        ] },
  { name: "J", teams: ["Turkey",    "Paraguay", "Ivory Coast",    "Iraq"        ] },
  { name: "K", teams: ["Austria",   "Scotland", "New Zealand",    "Jordan"      ] },
  { name: "L", teams: ["Sweden",    "Haiti",    "Bosnia & Herzegovina", "Qatar" ] },
];

/** Return the group definition for a given group name (A–L), or undefined. */
export function getWcGroup(groupName: string): WcGroup | undefined {
  return WC_2026_GROUPS.find((g) => g.name === groupName);
}

export interface WcTeamInfo { name: string; abbr: string; flagUrl: string; }

/** Return display metadata for a WC team by canonical name. */
export function getWcTeamInfo(name: string): WcTeamInfo {
  const resolved = resolveTeamName(name);
  const meta = TEAM_META[resolved];
  const espnSlug = meta?.espnSlug ?? "";
  return {
    name: resolved,
    abbr: meta?.abbr ?? resolved.slice(0, 3).toUpperCase(),
    flagUrl: espnSlug
      ? `https://a.espncdn.com/i/teamlogos/countries/500/${espnSlug}.png`
      : "",
  };
}
