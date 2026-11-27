import { parseEspnNbaSpread } from "./nba-ats-spread-parse";
import { nbaSeasonYearFromDate } from "./nba-season-year";

const ESPN_NBA = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_NBA_CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const ESPN_NBA_SUMMARY = `${ESPN_NBA}/summary`;
const LEADER_CATEGORIES = ["pointsPerGame", "assistsPerGame", "reboundsPerGame"] as const;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type CacheEntry<T> = { at: number; data: T };
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.data as T);
  }
  return loader().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

export interface NbaMatchupTeamOffense {
  ppg: number | null;
  fgPct: number | null;
  threePct: number | null;
  apg: number | null;
  rpg: number | null;
}

export interface NbaMatchupTeamDefense {
  ppgAllowed: number | null;
  spg: number | null;
  bpg: number | null;
}

export interface NbaMatchupTeamRecords {
  overall: string | null;
  home: string | null;
  away: string | null;
}

export interface NbaMatchupTeamLeader {
  category: string;
  playerName: string;
  summary: string;
}

export interface NbaMatchupTeamSide {
  teamId: string;
  abbreviation: string;
  displayName: string;
  logo: string | null;
  primaryColor: string | null;
  alternateColor: string | null;
  records: NbaMatchupTeamRecords;
  offense: NbaMatchupTeamOffense;
  defense: NbaMatchupTeamDefense;
  leaders: NbaMatchupTeamLeader[];
}

export interface NbaMatchupSpread {
  summary: string | null;
  favoriteTeamId: string | null;
  spread: number | null;
}

export interface NbaMatchupPayload {
  season: number;
  away: NbaMatchupTeamSide;
  home: NbaMatchupTeamSide;
  spread: NbaMatchupSpread;
}

function numStat(stats: Array<{ name?: string; value?: number; perGameValue?: number }>, name: string): number | null {
  const row = stats.find((s) => s.name === name);
  if (!row) return null;
  const raw = row.perGameValue ?? row.value;
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Math.round(Number(raw) * 10) / 10;
}

function pctStat(stats: Array<{ name?: string; value?: number; displayValue?: string }>, name: string): number | null {
  const row = stats.find((s) => s.name === name);
  if (!row) return null;
  if (row.value != null && !Number.isNaN(Number(row.value))) {
    return Math.round(Number(row.value) * 10) / 10;
  }
  const dv = String(row.displayValue ?? "").replace("%", "").trim();
  const n = parseFloat(dv);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function parseTeamStatistics(data: unknown): { offense: NbaMatchupTeamOffense; defense: NbaMatchupTeamDefense } {
  const categories =
    (data as { results?: { stats?: { categories?: Array<{ name: string; stats: Array<{ name: string; value?: number; perGameValue?: number; displayValue?: string }> }> } } })
      ?.results?.stats?.categories ?? [];
  const byCat = Object.fromEntries(categories.map((c) => [c.name, c.stats]));
  const offensive = byCat.offensive ?? [];
  const general = byCat.general ?? [];
  const defensive = byCat.defensive ?? [];

  return {
    offense: {
      ppg: numStat(offensive, "avgPoints"),
      fgPct: pctStat(offensive, "fieldGoalPct"),
      threePct: pctStat(offensive, "threePointPct"),
      apg: numStat(offensive, "avgAssists"),
      rpg: numStat(general, "avgRebounds") ?? numStat(offensive, "avgRebounds"),
    },
    defense: {
      ppgAllowed: null,
      spg: numStat(defensive, "avgSteals"),
      bpg: numStat(defensive, "avgBlocks"),
    },
  };
}

function recordSummary(items: Array<{ type?: string; summary?: string }>, type: string): string | null {
  const row = items.find((i) => i.type === type);
  return row?.summary?.trim() || null;
}

function normalizeEspnHex(hex: unknown): string | null {
  if (hex == null) return null;
  const raw = String(hex).replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw}`;
}

function parseTeamProfile(data: unknown): {
  abbreviation: string;
  displayName: string;
  logo: string | null;
  primaryColor: string | null;
  alternateColor: string | null;
  records: NbaMatchupTeamRecords;
  ppgAllowed: number | null;
} {
  const team = (data as { team?: Record<string, unknown> })?.team ?? {};
  const items = (team.record as { items?: Array<{ type?: string; summary?: string; stats?: Array<{ name: string; value?: number }> }> })?.items ?? [];
  const total = items.find((i) => i.type === "total");
  let ppgAllowed: number | null = null;
  for (const stat of total?.stats ?? []) {
    if (stat.name === "avgPointsAgainst" && stat.value != null) {
      ppgAllowed = Math.round(Number(stat.value) * 10) / 10;
      break;
    }
  }

  const logos = (team.logos as Array<{ href?: string }> | undefined) ?? [];
  return {
    abbreviation: String(team.abbreviation ?? ""),
    displayName: String(team.displayName ?? team.name ?? ""),
    logo: logos[0]?.href ?? null,
    primaryColor: normalizeEspnHex(team.color),
    alternateColor: normalizeEspnHex(team.alternateColor),
    records: {
      overall: recordSummary(items, "total"),
      home: recordSummary(items, "home"),
      away: recordSummary(items, "road") ?? recordSummary(items, "away"),
    },
    ppgAllowed,
  };
}

async function fetchAthleteDisplayName(refUrl: string): Promise<string | null> {
  try {
    const res = await fetch(refUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string; fullName?: string };
    return data.displayName ?? data.fullName ?? null;
  } catch {
    return null;
  }
}

async function fetchTeamLeaders(
  teamId: string,
  season: number,
  seasontype: number,
): Promise<NbaMatchupTeamLeader[]> {
  return cached(`nba-team-leaders:${season}:${seasontype}:${teamId}`, async () => {
    const url =
      `${ESPN_NBA_CORE}/seasons/${season}/types/${seasontype}/teams/${teamId}/leaders?lang=en&region=us`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        categories?: Array<{
          name?: string;
          displayName?: string;
          leaders?: Array<{
            displayValue?: string;
            athlete?: { $ref?: string };
          }>;
        }>;
      };
      const want = new Set<string>(LEADER_CATEGORIES);
      const picked = data.categories?.filter((c) => c.name && want.has(c.name as (typeof LEADER_CATEGORIES)[number])) ?? [];

      const leaders = await Promise.all(
        picked.map(async (cat) => {
          const top = cat.leaders?.[0];
          const ref = top?.athlete?.$ref;
          const playerName = ref ? await fetchAthleteDisplayName(ref) : null;
          return {
            category: cat.displayName ?? cat.name ?? "Leader",
            playerName: playerName ?? "—",
            summary: String(top?.displayValue ?? "").trim() || "—",
          } satisfies NbaMatchupTeamLeader;
        }),
      );
      return leaders;
    } catch {
      return [];
    }
  });
}

async function loadTeamSide(
  teamId: string,
  season: number,
  seasontype: number,
): Promise<NbaMatchupTeamSide> {
  return cached(`nba-matchup-side:${season}:${seasontype}:${teamId}`, async () => {
    const [profileRes, statsRes, leaders] = await Promise.all([
      fetch(`${ESPN_NBA}/teams/${teamId}`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${ESPN_NBA}/teams/${teamId}/statistics?season=${season}&seasontype=${seasontype}`, {
        signal: AbortSignal.timeout(10_000),
      }),
      fetchTeamLeaders(teamId, season, seasontype),
    ]);

    if (!profileRes.ok) {
      throw new Error(`ESPN team profile unavailable (${teamId})`);
    }

    const profile = parseTeamProfile(await profileRes.json());
    const parsed = statsRes.ok ? parseTeamStatistics(await statsRes.json()) : {
      offense: { ppg: null, fgPct: null, threePct: null, apg: null, rpg: null },
      defense: { ppgAllowed: null, spg: null, bpg: null },
    };

    return {
      teamId,
      abbreviation: profile.abbreviation,
      displayName: profile.displayName,
      logo: profile.logo,
      primaryColor: profile.primaryColor,
      alternateColor: profile.alternateColor,
      records: profile.records,
      offense: parsed.offense,
      defense: {
        ...parsed.defense,
        ppgAllowed: profile.ppgAllowed ?? parsed.defense.ppgAllowed,
      },
      leaders,
    };
  });
}

async function loadSpreadForEvent(
  eventId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<NbaMatchupSpread> {
  return cached(`nba-matchup-spread:${eventId}`, async () => {
    try {
      const res = await fetch(`${ESPN_NBA_SUMMARY}?event=${encodeURIComponent(eventId)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { summary: null, favoriteTeamId: null, spread: null };
      }
      const data = (await res.json()) as { pickcenter?: unknown[] };
      const pc = (data.pickcenter ?? [])[0] ?? null;
      const parsed = parseEspnNbaSpread(pc, homeTeamId, awayTeamId);
      const details =
        pc && typeof pc === "object" && (pc as { details?: string }).details
          ? String((pc as { details: string }).details)
          : null;
      return {
        summary: details,
        favoriteTeamId: parsed?.favoriteTeamId ?? null,
        spread: parsed?.spread ?? null,
      };
    } catch {
      return { summary: null, favoriteTeamId: null, spread: null };
    }
  });
}

export async function buildNbaMatchupPayload(input: {
  awayTeamId: string;
  homeTeamId: string;
  season?: number;
  seasontype?: number;
  eventId?: string | null;
}): Promise<NbaMatchupPayload> {
  const season = input.season ?? nbaSeasonYearFromDate();
  const seasontype = input.seasontype ?? 2;

  const [away, home, spread] = await Promise.all([
    loadTeamSide(input.awayTeamId, season, seasontype),
    loadTeamSide(input.homeTeamId, season, seasontype),
    input.eventId
      ? loadSpreadForEvent(input.eventId, input.homeTeamId, input.awayTeamId)
      : Promise.resolve({
          summary: null,
          favoriteTeamId: null,
          spread: null,
        } satisfies NbaMatchupSpread),
  ]);

  return {
    season,
    away,
    home,
    spread,
  };
}