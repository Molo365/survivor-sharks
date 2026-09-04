/** ESPN publishes MLB postseason as games; this module aggregates them into series. */
export const MLB_BRACKET_SLOTS = [
  ["wild_card", "AL_WC_1"], ["wild_card", "AL_WC_2"], ["wild_card", "NL_WC_1"], ["wild_card", "NL_WC_2"],
  ["division_series", "AL_DS_1"], ["division_series", "AL_DS_2"], ["division_series", "NL_DS_1"], ["division_series", "NL_DS_2"],
  ["league_championship", "ALCS"], ["league_championship", "NLCS"], ["world_series", "WORLD_SERIES"],
] as const;
export const MLB_ROUND_POINTS: Record<string, number> = { wild_card: 1, division_series: 2, league_championship: 3, world_series: 4 };
export const MLB_ROUND_LENGTHS: Record<string, number[]> = { wild_card: [2, 3], division_series: [3, 4, 5], league_championship: [4, 5, 6, 7], world_series: [4, 5, 6, 7] };
export const SANDBOX_MLB_FIELD = ["Baltimore Orioles", "Boston Red Sox", "Cleveland Guardians", "Detroit Tigers", "Houston Astros", "New York Yankees", "Atlanta Braves", "Chicago Cubs", "Los Angeles Dodgers", "Milwaukee Brewers", "New York Mets", "Philadelphia Phillies"];
export type MlbField = { AL: string[]; NL: string[] };

export function bracketBlueprint(field: MlbField) {
  const rows = (league: "AL" | "NL", teams: string[]) => [
    { seriesSlot: `${league}_WC_1`, round: "wild_card", fixedTeam1: teams[2], fixedTeam2: teams[5] },
    { seriesSlot: `${league}_WC_2`, round: "wild_card", fixedTeam1: teams[3], fixedTeam2: teams[4] },
    { seriesSlot: `${league}_DS_1`, round: "division_series", fixedTeam1: teams[0], feederSlot1: `${league}_WC_2` },
    { seriesSlot: `${league}_DS_2`, round: "division_series", fixedTeam1: teams[1], feederSlot1: `${league}_WC_1` },
    { seriesSlot: `${league}CS`, round: "league_championship", feederSlot1: `${league}_DS_1`, feederSlot2: `${league}_DS_2` },
  ];
  return [...rows("AL", field.AL), ...rows("NL", field.NL), { seriesSlot: "WORLD_SERIES", round: "world_series", feederSlot1: "ALCS", feederSlot2: "NLCS" }];
}

export type MlbSeries = { seriesId: string; round: string; seriesSlot: string; team1: string; team2: string; games: number; startsAt: Date; winner: string | null; completed: boolean; completedAt: Date | null };
type Competition = { date?: string; altGameNote?: string; notes?: Array<{ headline?: string }>; status?: { type?: { completed?: boolean } }; competitors?: Array<{ homeAway?: string; winner?: boolean; team?: { displayName?: string } }> };
type Event = { date?: string; competitions?: Competition[] };

function roundFor(note: string): string | null {
  const n = note.toUpperCase();
  if (n.includes("ALWC") || n.includes("NLWC") || n.includes("WILD CARD")) return "wild_card";
  if (n.includes("ALDS") || n.includes("NLDS") || n.includes("DIVISION SERIES")) return "division_series";
  if (n.includes("ALCS") || n.includes("NLCS") || n.includes("LEAGUE CHAMPIONSHIP")) return "league_championship";
  if (n.includes("WORLD SERIES")) return "world_series";
  return null;
}
function leagueFor(note: string): "AL" | "NL" | null {
  const n = note.toUpperCase();
  if (n.includes("ALWC") || n.includes("ALDS") || n.includes("ALCS") || n.includes("AMERICAN")) return "AL";
  if (n.includes("NLWC") || n.includes("NLDS") || n.includes("NLCS") || n.includes("NATIONAL")) return "NL";
  return null;
}

export async function fetchMlbPostseasonSeries(season = new Date().getFullYear()): Promise<MlbSeries[]> {
  const dates = `${season}0901-${season}1130`;
  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dates}&limit=1000&seasontype=3`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const data = await response.json() as { events?: Event[] };
    const groups = new Map<string, { round: string; league: "AL" | "NL" | null; teams: [string, string]; wins: Map<string, number>; completedGames: number; startsAt: Date; completedAt: Date | null }>();
    for (const event of data.events ?? []) {
      const competition = event.competitions?.[0];
      const note = competition?.notes?.[0]?.headline ?? competition?.altGameNote ?? "";
      const round = roundFor(note);
      const competitors = competition?.competitors ?? [];
      const home = competitors.find(c => c.homeAway === "home")?.team?.displayName;
      const away = competitors.find(c => c.homeAway === "away")?.team?.displayName;
      if (!round || !home || !away) continue;
      const key = `${round}:${[home, away].sort().join("|")}`;
      const startsAt = new Date(competition?.date ?? event.date ?? Date.now());
      const group = groups.get(key) ?? { round, league: leagueFor(note), teams: [away, home], wins: new Map(), completedGames: 0, startsAt, completedAt: null };
      if (startsAt < group.startsAt) group.startsAt = startsAt;
      if (competition?.status?.type?.completed) {
        group.completedGames++;
        const winner = competitors.find(c => c.winner)?.team?.displayName;
        if (winner) group.wins.set(winner, (group.wins.get(winner) ?? 0) + 1);
        group.completedAt = new Date(competition.date ?? event.date ?? Date.now());
      }
      groups.set(key, group);
    }
    const ordered = [...groups.values()].sort((a, b) => a.round.localeCompare(b.round) || (a.league ?? "ZZ").localeCompare(b.league ?? "ZZ") || a.teams.join("|").localeCompare(b.teams.join("|")));
    const counts = new Map<string, number>();
    return ordered.map(group => {
      const need = group.round === "wild_card" ? 2 : group.round === "division_series" ? 3 : 4;
      const winner = [...group.wins].find(([, wins]) => wins >= need)?.[0] ?? null;
      const league = group.league;
      const groupKey = `${group.round}:${league ?? ""}`;
      const index = (counts.get(groupKey) ?? 0) + 1;
      counts.set(groupKey, index);
      const seriesSlot = group.round === "world_series" ? "WORLD_SERIES" : group.round === "league_championship" ? `${league ?? "AL"}CS` : `${league ?? "AL"}_${group.round === "wild_card" ? "WC" : "DS"}_${index}`;
      return { seriesId: seriesSlot, round: group.round, seriesSlot, team1: group.teams[0], team2: group.teams[1], games: group.completedGames, startsAt: group.startsAt, winner, completed: winner !== null, completedAt: winner ? group.completedAt : null };
    });
  } catch { return []; }
}
export async function getMlbPostseasonField(season = new Date().getFullYear()): Promise<MlbField | null> {
  try {
    const response = await fetch(`https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=${season}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const data = await response.json() as any;
    const entries: any[] = [];
    const collect = (node: any) => { if (node?.standings?.entries) entries.push(...node.standings.entries); for (const child of node?.children ?? []) collect(child); };
    collect(data);
    const seeded: MlbField = { AL: [], NL: [] };
    for (const entry of entries) {
      const stats = Object.fromEntries((entry.stats ?? []).map((stat: any) => [stat.name, stat.value]));
      const seed = Number(stats.playoffSeed);
      if (!Number.isInteger(seed) || seed < 1 || seed > 6 || entry.clincher === "e") continue;
      const league = /american|^al$/i.test(entry?.team?.league?.name ?? entry?.team?.groups?.parent?.name ?? "") ? "AL" : /national|^nl$/i.test(entry?.team?.league?.name ?? entry?.team?.groups?.parent?.name ?? "") ? "NL" : null;
      if (league) seeded[league][seed - 1] = entry.team.displayName;
    }
    return seeded.AL.filter(Boolean).length === 6 && seeded.NL.filter(Boolean).length === 6 ? seeded : null;
  } catch { return null; }
}