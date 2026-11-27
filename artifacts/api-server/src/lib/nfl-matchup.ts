import { parseEspnNflSpread } from "./nfl-pickem-ats-spread-parse";

const ESPN_NFL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_NFL_SUMMARY = `${ESPN_NFL}/summary`;
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

export interface NflMatchupTeamOffense {
  passYpg: number | null;
  rushYpg: number | null;
  totalYpg: number | null;
  ppg: number | null;
}

export interface NflMatchupTeamDefense {
  passYpg: number | null;
  rushYpg: number | null;
  totalYpg: number | null;
  ppg: number | null;
}

export interface NflMatchupTeamRecords {
  overall: string | null;
  home: string | null;
  away: string | null;
}

export interface NflMatchupTeamSide {
  teamId: string;
  abbreviation: string;
  displayName: string;
  logo: string | null;
  records: NflMatchupTeamRecords;
  offense: NflMatchupTeamOffense;
  defense: NflMatchupTeamDefense;
}

export interface NflMatchupSpread {
  summary: string | null;
  favoriteTeamId: string | null;
  spread: number | null;
}

export interface NflMatchupPayload {
  season: number;
  away: NflMatchupTeamSide;
  home: NflMatchupTeamSide;
  spread: NflMatchupSpread;
}

function numStat(stats: Array<{ name?: string; value?: number; perGameValue?: number }>, name: string): number | null {
  const row = stats.find((s) => s.name === name);
  if (!row) return null;
  const raw = row.perGameValue ?? row.value;
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Math.round(Number(raw) * 10) / 10;
}

function parseTeamStatistics(data: unknown): NflMatchupTeamOffense {
  const categories =
    (data as { results?: { stats?: { categories?: Array<{ name: string; stats: Array<{ name: string; value?: number; perGameValue?: number }> }> } } })
      ?.results?.stats?.categories ?? [];
  const byCat = Object.fromEntries(categories.map((c) => [c.name, c.stats]));
  return {
    passYpg: numStat(byCat.passing ?? [], "netPassingYardsPerGame")
      ?? numStat(byCat.passing ?? [], "passingYardsPerGame"),
    rushYpg: numStat(byCat.rushing ?? [], "rushingYardsPerGame"),
    totalYpg: numStat(byCat.passing ?? [], "yardsPerGame")
      ?? numStat(byCat.passing ?? [], "netYardsPerGame"),
    ppg: numStat(byCat.scoring ?? [], "totalPointsPerGame"),
  };
}

function recordSummary(items: Array<{ type?: string; summary?: string }>, type: string): string | null {
  const row = items.find((i) => i.type === type);
  return row?.summary?.trim() || null;
}

function parseTeamProfile(data: unknown): {
  abbreviation: string;
  displayName: string;
  logo: string | null;
  records: NflMatchupTeamRecords;
  defensePpg: number | null;
} {
  const team = (data as { team?: Record<string, unknown> })?.team ?? {};
  const items = (team.record as { items?: Array<{ type?: string; summary?: string; stats?: Array<{ name: string; value?: number }> }> })?.items ?? [];
  const total = items.find((i) => i.type === "total");
  let defensePpg: number | null = null;
  for (const stat of total?.stats ?? []) {
    if (stat.name === "avgPointsAgainst" && stat.value != null) {
      defensePpg = Math.round(Number(stat.value) * 10) / 10;
      break;
    }
    if (stat.name === "pointsAgainst" && stat.value != null) {
      const gp = total?.stats?.find((s) => s.name === "gamesPlayed")?.value;
      if (gp && Number(gp) > 0) {
        defensePpg = Math.round((Number(stat.value) / Number(gp)) * 10) / 10;
      }
    }
  }

  const logos = (team.logos as Array<{ href?: string }> | undefined) ?? [];
  return {
    abbreviation: String(team.abbreviation ?? ""),
    displayName: String(team.displayName ?? team.name ?? ""),
    logo: logos[0]?.href ?? null,
    records: {
      overall: recordSummary(items, "total"),
      home: recordSummary(items, "home"),
      away: recordSummary(items, "road"),
    },
    defensePpg,
  };
}

function boxscoreStatValue(
  teamBlock: { statistics?: Array<{ name?: string; displayValue?: string; value?: number }> },
  statName: string,
): number | null {
  const row = teamBlock.statistics?.find((s) => s.name === statName);
  if (!row) return null;
  if (row.value != null && !Number.isNaN(Number(row.value))) return Number(row.value);
  const dv = row.displayValue;
  if (dv != null) {
    const n = parseInt(String(dv).replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

async function fetchDefenseYpg(teamId: string, season: number, seasontype: number): Promise<Omit<NflMatchupTeamDefense, "ppg">> {
  return cached(`nfl-def-yds:${season}:${seasontype}:${teamId}`, async () => {
    const schedRes = await fetch(
      `${ESPN_NFL}/teams/${teamId}/schedule?season=${season}&seasontype=${seasontype}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!schedRes.ok) {
      return { passYpg: null, rushYpg: null, totalYpg: null };
    }
    const sched = (await schedRes.json()) as {
      events?: Array<{
        id: string;
        competitions?: Array<{
          status?: { type?: { completed?: boolean } };
        }>;
      }>;
    };

    const completedIds =
      sched.events
        ?.filter((e) => e.competitions?.[0]?.status?.type?.completed)
        .map((e) => e.id) ?? [];

    if (completedIds.length === 0) {
      return { passYpg: null, rushYpg: null, totalYpg: null };
    }

    let passTotal = 0;
    let rushTotal = 0;
    let yardsTotal = 0;
    let counted = 0;

    const batchSize = 4;
    for (let i = 0; i < completedIds.length; i += batchSize) {
      const batch = completedIds.slice(i, i + batchSize);
      const summaries = await Promise.all(
        batch.map(async (eventId) => {
          try {
            const res = await fetch(`${ESPN_NFL_SUMMARY}?event=${eventId}`, {
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return null;
            return (await res.json()) as {
              boxscore?: {
                teams?: Array<{
                  team?: { id?: string };
                  statistics?: Array<{ name?: string; displayValue?: string; value?: number }>;
                }>;
              };
            };
          } catch {
            return null;
          }
        }),
      );

      for (const summary of summaries) {
        const teams = summary?.boxscore?.teams ?? [];
        const opp = teams.find((t) => String(t.team?.id) !== teamId);
        if (!opp) continue;
        const pass = boxscoreStatValue(opp, "netPassingYards");
        const rush = boxscoreStatValue(opp, "rushingYards");
        const total = boxscoreStatValue(opp, "totalYards");
        if (pass == null && rush == null && total == null) continue;
        if (pass != null) passTotal += pass;
        if (rush != null) rushTotal += rush;
        if (total != null) yardsTotal += total;
        counted += 1;
      }
    }

    if (counted === 0) {
      return { passYpg: null, rushYpg: null, totalYpg: null };
    }

    const round = (n: number) => Math.round((n / counted) * 10) / 10;
    return {
      passYpg: passTotal > 0 ? round(passTotal) : null,
      rushYpg: rushTotal > 0 ? round(rushTotal) : null,
      totalYpg: yardsTotal > 0 ? round(yardsTotal) : null,
    };
  });
}

async function loadTeamSide(
  teamId: string,
  season: number,
  seasontype: number,
): Promise<NflMatchupTeamSide> {
  return cached(`nfl-matchup-side:${season}:${seasontype}:${teamId}`, async () => {
    const [profileRes, statsRes, defenseYards] = await Promise.all([
      fetch(`${ESPN_NFL}/teams/${teamId}`, { signal: AbortSignal.timeout(10_000) }),
      fetch(`${ESPN_NFL}/teams/${teamId}/statistics?season=${season}&seasontype=${seasontype}`, {
        signal: AbortSignal.timeout(10_000),
      }),
      fetchDefenseYpg(teamId, season, seasontype),
    ]);

    if (!profileRes.ok) {
      throw new Error(`ESPN team profile unavailable (${teamId})`);
    }

    const profile = parseTeamProfile(await profileRes.json());
    const offense = statsRes.ok ? parseTeamStatistics(await statsRes.json()) : {
      passYpg: null,
      rushYpg: null,
      totalYpg: null,
      ppg: null,
    };

    return {
      teamId,
      abbreviation: profile.abbreviation,
      displayName: profile.displayName,
      logo: profile.logo,
      records: profile.records,
      offense,
      defense: {
        ...defenseYards,
        ppg: profile.defensePpg,
      },
    };
  });
}

export async function buildNflMatchupPayload(input: {
  awayTeamId: string;
  homeTeamId: string;
  season: number;
  seasontype?: number;
  eventId?: string | null;
}): Promise<NflMatchupPayload> {
  const seasontype = input.seasontype ?? 2;

  const [away, home, spread] = await Promise.all([
    loadTeamSide(input.awayTeamId, input.season, seasontype),
    loadTeamSide(input.homeTeamId, input.season, seasontype),
    input.eventId ? loadSpreadForEvent(input.eventId, input.homeTeamId, input.awayTeamId) : Promise.resolve({
      summary: null,
      favoriteTeamId: null,
      spread: null,
    } satisfies NflMatchupSpread),
  ]);

  return {
    season: input.season,
    away,
    home,
    spread,
  };
}

async function loadSpreadForEvent(
  eventId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<NflMatchupSpread> {
  return cached(`nfl-matchup-spread:${eventId}`, async () => {
    try {
      const res = await fetch(`${ESPN_NFL_SUMMARY}?event=${eventId}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { summary: null, favoriteTeamId: null, spread: null };
      }
      const data = (await res.json()) as { pickcenter?: unknown[] };
      const pc = (data.pickcenter ?? [])[0] ?? null;
      const parsed = parseEspnNflSpread(pc, homeTeamId, awayTeamId);
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