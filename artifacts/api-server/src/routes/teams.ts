import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { ESPN_TEAMS, getTeamLogoUrl, type Sport } from "../lib/teams-data";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface InjuryItem {
  name: string;
  position: string | null;
  status: string;
  injuryType: string | null;
}

interface PitcherInfo {
  name: string;
  photoUrl: string | null;
  era: string | null;
  wins: number | null;
  losses: number | null;
}

interface WeatherInfo {
  displayValue: string;
  temperature: number | null;
  conditionDescription: string | null;
  windSpeed: number | null;
  windDirection: string | null;
}

type EspnRecord = { name?: string; abbreviation?: string; summary?: string };

type EspnOdds = {
  details?: string;
  overUnder?: number;
  spread?: number;
  awayTeamOdds?: { moneyLine?: number };
  homeTeamOdds?: { moneyLine?: number };
};

type EspnWeather = {
  displayValue?: string;
  highTemperature?: number;
  conditionDescription?: string;
  windDirection?: string;
  windSpeed?: number;
};

type EspnProbable = {
  homeAway?: string;
  athlete?: {
    displayName?: string;
    headshot?: { href?: string };
  };
  statistics?: { abbreviation?: string; displayValue?: string }[];
};

type EspnCompetitor = {
  homeAway: string;
  score?: string;
  records?: EspnRecord[];
  winner?: boolean;
  team: {
    id: string;
    displayName: string;
    abbreviation: string;
    logo?: string;
    color?: string;
    alternateColor?: string;
  };
};

type EspnStatusType = { completed?: boolean; name?: string; state?: string };

type EspnEvent = {
  id: string;
  date: string;
  competitions?: {
    competitors?: EspnCompetitor[];
    status?: { type?: EspnStatusType };
    odds?: EspnOdds[];
    weather?: EspnWeather;
    probables?: EspnProbable[];
  }[];
};

type EspnInjuryGroup = {
  id: string;
  displayName: string;
  injuries?: {
    athlete?: {
      displayName?: string;
      position?: { abbreviation?: string };
    };
    status?: string;
    type?: { description?: string };
    details?: { type?: string; detail?: string };
  }[];
};

// ── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry { data: unknown; ts: number }
const scheduleCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): unknown | null {
  const e = scheduleCache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}
function setCache(key: string, data: unknown) {
  scheduleCache.set(key, { data, ts: Date.now() });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getRecord(comp: EspnCompetitor | undefined): string | null {
  if (!comp?.records?.length) return null;
  const r = comp.records.find(r => r.name === "overall" || r.abbreviation === "Total") ?? comp.records[0];
  return r?.summary ?? null;
}

function parsePitcher(prob: EspnProbable): PitcherInfo | null {
  if (!prob.athlete?.displayName) return null;
  const stats = prob.statistics ?? [];
  const get = (abbr: string) => stats.find(s => s.abbreviation === abbr)?.displayValue ?? null;
  const wStr = get("W");
  const lStr = get("L");
  return {
    name: prob.athlete.displayName,
    photoUrl: prob.athlete.headshot?.href ?? null,
    era: get("ERA"),
    wins: wStr != null ? parseInt(wStr) : null,
    losses: lStr != null ? parseInt(lStr) : null,
  };
}

function parseWeather(w: EspnWeather): WeatherInfo {
  return {
    displayValue: w.displayValue ?? "",
    temperature: w.highTemperature ?? null,
    conditionDescription: w.conditionDescription ?? null,
    windSpeed: w.windSpeed != null ? Math.round(w.windSpeed) : null,
    windDirection: w.windDirection ?? null,
  };
}

// Fetch league-wide injury report → Map<espnTeamId, InjuryItem[]>
async function fetchInjuries(espnSportPath: string): Promise<Map<string, InjuryItem[]>> {
  const result = new Map<string, InjuryItem[]>();
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSportPath}/injuries`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return result;
    const data = await res.json() as { injuries?: EspnInjuryGroup[] };
    const RELEVANT = new Set(["out", "questionable", "doubtful", "day-to-day", "ir", "injured reserve"]);
    for (const group of data.injuries ?? []) {
      const teamId = String(group.id);
      const items: InjuryItem[] = (group.injuries ?? [])
        .filter(i => {
          const s = (i.status ?? i.type?.description ?? "").toLowerCase();
          return [...RELEVANT].some(r => s.includes(r));
        })
        .slice(0, 4)
        .map(i => ({
          name: i.athlete?.displayName ?? "Unknown",
          position: i.athlete?.position?.abbreviation ?? null,
          status: i.status ?? i.type?.description ?? "Unknown",
          injuryType: i.details?.type ?? null,
        }));
      if (items.length) result.set(teamId, items);
    }
  } catch { /* silent */ }
  return result;
}

// Fetch last 5 game results for one team → ["W","L","W","W","L"]
async function fetchTeamForm(espnSportPath: string, teamId: string): Promise<string[]> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSportPath}/teams/${teamId}/schedule`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json() as { events?: { competitions?: { status?: { type?: { completed?: boolean } }; competitors?: { team?: { id?: string }; winner?: boolean }[] }[] }[] };
    const completed = (data.events ?? []).filter(e => e.competitions?.[0]?.status?.type?.completed);
    return completed.slice(-5).map(e => {
      const comp = e.competitions![0];
      const me = (comp.competitors ?? []).find(c => c.team?.id === teamId);
      return me?.winner === true ? "W" : "L";
    });
  } catch { return []; }
}

// Full injury report with team names (for the dedicated Injuries tab)
async function fetchFullInjuryReport(espnSportPath: string): Promise<{ teamId: string; teamName: string; injuries: InjuryItem[] }[]> {
  const result: { teamId: string; teamName: string; injuries: InjuryItem[] }[] = [];
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSportPath}/injuries`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return result;
    const data = await res.json() as { injuries?: EspnInjuryGroup[] };
    const RELEVANT = new Set(["out", "questionable", "doubtful", "day-to-day", "ir", "injured reserve"]);
    for (const group of data.injuries ?? []) {
      const injuries: InjuryItem[] = (group.injuries ?? [])
        .filter(i => {
          const s = (i.status ?? i.type?.description ?? "").toLowerCase();
          return [...RELEVANT].some(r => s.includes(r));
        })
        .map(i => ({
          name: i.athlete?.displayName ?? "Unknown",
          position: i.athlete?.position?.abbreviation ?? null,
          status: i.status ?? i.type?.description ?? "Unknown",
          injuryType: i.details?.type ?? null,
        }));
      if (injuries.length > 0) {
        result.push({ teamId: String(group.id), teamName: group.displayName, injuries });
      }
    }
  } catch { /* silent */ }
  return result;
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/sports/:sport/injuries
router.get("/:sport/injuries", requireAuth, async (req, res) => {
  const sport = String(req.params.sport) as Sport;
  const espnPath = sport === "nfl" ? "football/nfl"
    : sport === "nba" ? "basketball/nba"
    : sport === "mlb" ? "baseball/mlb"
    : sport === "nhl" ? "hockey/nhl"
    : "soccer/fifa.world";

  const report = await fetchFullInjuryReport(espnPath);
  res.json(report);
});

// GET /api/sports/:sport/teams
router.get("/:sport/teams", requireAuth, (req, res) => {
  const sport = String(req.params.sport) as Sport;
  const teams = ESPN_TEAMS[sport];
  if (!teams) { res.status(404).json({ error: "Unknown sport" }); return; }
  res.json(teams.map(t => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    sport,
    logoUrl: getTeamLogoUrl(sport, t),
    location: t.location,
    conference: t.conference ?? null,
    division: t.division ?? null,
    flagUrl: sport === "fifa" ? getTeamLogoUrl(sport, t) : null,
  })));
});

// GET /api/sports/:sport/schedule/:week
router.get("/:sport/schedule/:week", requireAuth, async (req, res) => {
  const sport = String(req.params.sport) as Sport;
  const week = parseInt(String(req.params.week));
  const cacheKey = `${sport}-${week}`;

  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  const espnPath = sport === "nfl" ? "football/nfl"
    : sport === "nba" ? "basketball/nba"
    : sport === "mlb" ? "baseball/mlb"
    : sport === "nhl" ? "hockey/nhl"
    : "soccer/fifa.world";

  const scoreboardUrl = sport === "nfl"
    ? `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?week=${week}&seasontype=2`
    : `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;

  try {
    const sbRes = await fetch(scoreboardUrl, { signal: AbortSignal.timeout(6000) });
    if (!sbRes.ok) { res.json([]); return; }

    const sbData = await sbRes.json() as { events?: EspnEvent[] };
    const events = sbData.events ?? [];
    if (!events.length) { res.json([]); return; }

    // Parse base game data from scoreboard
    type BaseGame = {
      id: string; sport: string; startTime: string; week: number; season: number;
      status: string; hasStarted: boolean;
      homeScore: number | null; awayScore: number | null;
      homeRecord: string | null; awayRecord: string | null;
      homeTeam: { id: string; name: string; abbreviation: string; sport: string; logoUrl: string | null; location: null; conference: null; division: null; flagUrl: null };
      awayTeam: { id: string; name: string; abbreviation: string; sport: string; logoUrl: string | null; location: null; conference: null; division: null; flagUrl: null };
      odds: { details: string; overUnder: number | null; spread: number | null } | null;
      awayMoneyline: number | null; homeMoneyline: number | null;
      awayPrimaryColor: string | null; homePrimaryColor: string | null;
      awayAlternateColor: string | null; homeAlternateColor: string | null;
      weather: WeatherInfo | null;
      awayPitcher: PitcherInfo | null; homePitcher: PitcherInfo | null;
    };

    const baseGames: BaseGame[] = events.map(event => {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === "home");
      const away = comp?.competitors?.find(c => c.homeAway === "away");
      const state = comp?.status?.type?.state ?? "pre";
      const isCompleted = comp?.status?.type?.completed ?? false;
      const hasStarted = state === "in" || state === "post" || isCompleted;
      const o = comp?.odds?.[0];
      const probs = comp?.probables ?? [];
      const homeProbable = probs.find(p => p.homeAway === "home");
      const awayProbable = probs.find(p => p.homeAway === "away");

      return {
        id: event.id,
        sport,
        startTime: event.date,
        week,
        season: new Date().getFullYear(),
        status: comp?.status?.type?.name ?? "STATUS_SCHEDULED",
        hasStarted,
        homeScore: home?.score != null ? parseInt(home.score) : null,
        awayScore: away?.score != null ? parseInt(away.score) : null,
        homeRecord: getRecord(home),
        awayRecord: getRecord(away),
        homeTeam: {
          id: home?.team.id ?? "",
          name: home?.team.displayName ?? "",
          abbreviation: home?.team.abbreviation ?? "",
          sport,
          logoUrl: home?.team.logo ?? null,
          location: null, conference: null, division: null, flagUrl: null,
        },
        awayTeam: {
          id: away?.team.id ?? "",
          name: away?.team.displayName ?? "",
          abbreviation: away?.team.abbreviation ?? "",
          sport,
          logoUrl: away?.team.logo ?? null,
          location: null, conference: null, division: null, flagUrl: null,
        },
        odds: o ? {
          details: o.details ?? "",
          overUnder: o.overUnder ?? null,
          spread: o.spread ?? null,
        } : null,
        awayMoneyline: o?.awayTeamOdds?.moneyLine ?? null,
        homeMoneyline: o?.homeTeamOdds?.moneyLine ?? null,
        awayPrimaryColor: away?.team.color ?? null,
        homePrimaryColor: home?.team.color ?? null,
        awayAlternateColor: away?.team.alternateColor ?? null,
        homeAlternateColor: home?.team.alternateColor ?? null,
        weather: comp?.weather ? parseWeather(comp.weather) : null,
        awayPitcher: awayProbable ? parsePitcher(awayProbable) : null,
        homePitcher: homeProbable ? parsePitcher(homeProbable) : null,
      };
    });

    // Fetch injuries + recent form in parallel
    const teamIds = [...new Set(baseGames.flatMap(g => [g.homeTeam.id, g.awayTeam.id]).filter(Boolean))];

    const [injuryMap, formEntries] = await Promise.all([
      sport !== "fifa" ? fetchInjuries(espnPath) : Promise.resolve(new Map<string, InjuryItem[]>()),
      Promise.all(teamIds.map(id => fetchTeamForm(espnPath, id).then(form => ({ id, form })))),
    ]);

    const formMap = new Map(formEntries.map(e => [e.id, e.form]));

    const enriched = baseGames.map(g => ({
      ...g,
      homeInjuries: injuryMap.get(g.homeTeam.id) ?? [],
      awayInjuries: injuryMap.get(g.awayTeam.id) ?? [],
      homeForm: formMap.get(g.homeTeam.id) ?? [],
      awayForm: formMap.get(g.awayTeam.id) ?? [],
    }));

    setCache(cacheKey, enriched);
    res.json(enriched);
  } catch (err) {
    req.log?.warn({ sport, week, err }, "Schedule fetch failed");
    res.json([]);
  }
});

export default router;
