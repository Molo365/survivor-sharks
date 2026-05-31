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
// openfootball name → { abbr, flagCode (flagcdn.com alpha-2), slug }
// ---------------------------------------------------------------------------
interface TeamMeta { abbr: string; flagCode: string; slug: string }

const TEAM_META: Record<string, TeamMeta> = {
  "Algeria":               { abbr: "ALG", flagCode: "dz", slug: "algeria" },
  "Argentina":             { abbr: "ARG", flagCode: "ar", slug: "argentina" },
  "Australia":             { abbr: "AUS", flagCode: "au", slug: "australia" },
  "Austria":               { abbr: "AUT", flagCode: "at", slug: "austria" },
  "Belgium":               { abbr: "BEL", flagCode: "be", slug: "belgium" },
  "Bosnia & Herzegovina":  { abbr: "BIH", flagCode: "ba", slug: "bosnia_herzegovina" },
  "Brazil":                { abbr: "BRA", flagCode: "br", slug: "brazil" },
  "Canada":                { abbr: "CAN", flagCode: "ca", slug: "canada" },
  "Cape Verde":            { abbr: "CPV", flagCode: "cv", slug: "cape_verde" },
  "Colombia":              { abbr: "COL", flagCode: "co", slug: "colombia" },
  "Croatia":               { abbr: "CRO", flagCode: "hr", slug: "croatia" },
  "Curaçao":               { abbr: "CUW", flagCode: "cw", slug: "curacao" },
  "Czech Republic":        { abbr: "CZE", flagCode: "cz", slug: "czech_republic" },
  "DR Congo":              { abbr: "COD", flagCode: "cd", slug: "dr_congo" },
  "Ecuador":               { abbr: "ECU", flagCode: "ec", slug: "ecuador" },
  "Egypt":                 { abbr: "EGY", flagCode: "eg", slug: "egypt" },
  "England":               { abbr: "ENG", flagCode: "gb-eng", slug: "england" },
  "France":                { abbr: "FRA", flagCode: "fr", slug: "france" },
  "Germany":               { abbr: "GER", flagCode: "de", slug: "germany" },
  "Ghana":                 { abbr: "GHA", flagCode: "gh", slug: "ghana" },
  "Haiti":                 { abbr: "HAI", flagCode: "ht", slug: "haiti" },
  "Iran":                  { abbr: "IRN", flagCode: "ir", slug: "iran" },
  "Iraq":                  { abbr: "IRQ", flagCode: "iq", slug: "iraq" },
  "Ivory Coast":           { abbr: "CIV", flagCode: "ci", slug: "ivory_coast" },
  "Japan":                 { abbr: "JPN", flagCode: "jp", slug: "japan" },
  "Jordan":                { abbr: "JOR", flagCode: "jo", slug: "jordan" },
  "Mexico":                { abbr: "MEX", flagCode: "mx", slug: "mexico" },
  "Morocco":               { abbr: "MAR", flagCode: "ma", slug: "morocco" },
  "Netherlands":           { abbr: "NED", flagCode: "nl", slug: "netherlands" },
  "New Zealand":           { abbr: "NZL", flagCode: "nz", slug: "new_zealand" },
  "Norway":                { abbr: "NOR", flagCode: "no", slug: "norway" },
  "Panama":                { abbr: "PAN", flagCode: "pa", slug: "panama" },
  "Paraguay":              { abbr: "PAR", flagCode: "py", slug: "paraguay" },
  "Portugal":              { abbr: "POR", flagCode: "pt", slug: "portugal" },
  "Qatar":                 { abbr: "QAT", flagCode: "qa", slug: "qatar" },
  "Saudi Arabia":          { abbr: "KSA", flagCode: "sa", slug: "saudi_arabia" },
  "Scotland":              { abbr: "SCO", flagCode: "gb-sct", slug: "scotland" },
  "Senegal":               { abbr: "SEN", flagCode: "sn", slug: "senegal" },
  "South Africa":          { abbr: "RSA", flagCode: "za", slug: "south_africa" },
  "South Korea":           { abbr: "KOR", flagCode: "kr", slug: "south_korea" },
  "Spain":                 { abbr: "ESP", flagCode: "es", slug: "spain" },
  "Sweden":                { abbr: "SWE", flagCode: "se", slug: "sweden" },
  "Switzerland":           { abbr: "SUI", flagCode: "ch", slug: "switzerland" },
  "Tunisia":               { abbr: "TUN", flagCode: "tn", slug: "tunisia" },
  "Turkey":                { abbr: "TUR", flagCode: "tr", slug: "turkey" },
  "USA":                   { abbr: "USA", flagCode: "us", slug: "usa" },
  "Uruguay":               { abbr: "URU", flagCode: "uy", slug: "uruguay" },
  "Uzbekistan":            { abbr: "UZB", flagCode: "uz", slug: "uzbekistan" },
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

function flagUrl(flagCode: string): string | null {
  if (!flagCode) return null;
  return `https://flagcdn.com/h40/${flagCode}.png`;
}

function buildTeam(name: string): WcTeam {
  const resolved = resolveTeamName(name);
  const meta = teamMeta(resolved);
  return {
    id: meta.slug,
    displayName: resolved,
    abbreviation: meta.abbr,
    logo: flagUrl(meta.flagCode),
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
