export type SoccerFormResult = "W" | "D" | "L";

export interface SoccerFormMatch {
  result: SoccerFormResult;
  eventId: string;
  date: string | null;
  shortName: string | null;
  scoreLine: string | null;
}

const DOMESTIC_LEAGUE_SLUG: Record<string, string> = {
  // England
  "359": "eng.1",
  "363": "eng.1",
  "364": "eng.1",
  "382": "eng.1",
  "360": "eng.1",
  "367": "eng.1",
  // Spain
  "83": "esp.1",
  "86": "esp.1",
  "1068": "esp.1",
  "243": "esp.1",
  // Italy
  "103": "ita.1",
  "110": "ita.1",
  "111": "ita.1",
  "114": "ita.1",
  "104": "ita.1",
  // Germany
  "132": "ger.1",
  "124": "ger.1",
  "131": "ger.1",
  "11420": "ger.1",
  // France
  "160": "fra.1",
  "176": "fra.1",
  "167": "fra.1",
  // Turkey
  "432": "tur.1",
  "436": "tur.1",
  // Portugal
  "1929": "por.1",
  "437": "por.1",
  "2250": "por.1",
  // Scotland
  "256": "sco.1",
  "257": "sco.1",
  // Saudi
  "817": "ksa.1",
  "929": "ksa.1",
};

const SPORT_FORM_SLUGS: Record<string, string[]> = {
  championsleague: ["uefa.champions"],
  mls: ["usa.1"],
  superleague: ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "tur.1", "por.1", "sco.1", "ksa.1"],
  worldcup: ["fifa.world"],
  intl: ["fifa.friendly", "fifa.world"],
};

type EspnScheduleEvent = {
  id?: string;
  date?: string;
  shortName?: string;
  competitions?: Array<{
    status?: { type?: { completed?: boolean } };
    competitors?: Array<{
      homeAway?: string;
      winner?: boolean;
      score?: string;
      team?: { id?: string };
    }>;
  }>;
};

function parseFormFromEvent(event: EspnScheduleEvent, teamId: string): SoccerFormMatch | null {
  const comp = event.competitions?.[0];
  if (!comp?.status?.type?.completed) return null;
  const competitors = comp.competitors ?? [];
  const me = competitors.find((c) => c.team?.id === teamId);
  if (!me) return null;
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  const hs = home?.score != null ? parseInt(String(home.score), 10) : NaN;
  const as = away?.score != null ? parseInt(String(away.score), 10) : NaN;
  let result: SoccerFormResult;
  if (Number.isFinite(hs) && Number.isFinite(as) && hs === as) {
    result = "D";
  } else if (me.winner === true) {
    result = "W";
  } else {
    result = "L";
  }
  const scoreLine =
    home?.score != null && away?.score != null ? `${home.score}–${away.score}` : null;
  return {
    result,
    eventId: String(event.id ?? ""),
    date: event.date ?? null,
    shortName: event.shortName ?? null,
    scoreLine,
  };
}

async function fetchSlugSchedule(slug: string, teamId: string): Promise<SoccerFormMatch[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/schedule`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: EspnScheduleEvent[] };
    return (data.events ?? [])
      .map((e) => parseFormFromEvent(e, teamId))
      .filter((row): row is SoccerFormMatch => row != null && row.eventId.length > 0);
  } catch {
    return [];
  }
}

/** Last five completed matches (W/D/L), merging competition schedules when needed. */
export async function fetchSoccerTeamForm(input: {
  teamId: string;
  sport: string;
  limit?: number;
}): Promise<SoccerFormMatch[]> {
  const limit = input.limit ?? 5;
  const sportSlugs = SPORT_FORM_SLUGS[input.sport] ?? ["uefa.champions"];
  const domestic = DOMESTIC_LEAGUE_SLUG[input.teamId];
  const slugs = [...new Set([...sportSlugs, domestic].filter(Boolean))];

  const batches = await Promise.all(slugs.map((slug) => fetchSlugSchedule(slug, input.teamId)));
  const byId = new Map<string, SoccerFormMatch>();
  for (const row of batches.flat()) {
    byId.set(row.eventId, row);
  }
  const sorted = [...byId.values()].sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : 0;
    const tb = b.date ? Date.parse(b.date) : 0;
    return ta - tb;
  });
  return sorted.slice(-limit);
}

export async function fetchSoccerMatchupForm(input: {
  awayTeamId: string;
  homeTeamId: string;
  sport: string;
}): Promise<{ away: SoccerFormMatch[]; home: SoccerFormMatch[] }> {
  const [away, home] = await Promise.all([
    fetchSoccerTeamForm({ teamId: input.awayTeamId, sport: input.sport }),
    fetchSoccerTeamForm({ teamId: input.homeTeamId, sport: input.sport }),
  ]);
  return { away, home };
}