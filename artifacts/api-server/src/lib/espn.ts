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
}

type EspnCompetitor = {
  homeAway: string;
  score?: string;
  team: { id: string; abbreviation: string; displayName: string; logo?: string };
};
type EspnEvent = {
  id: string;
  date: string;
  competitions?: { competitors?: EspnCompetitor[]; status?: { type?: { completed?: boolean; name?: string; state?: string } } }[];
};

function parseGame(event: EspnEvent): EspnGame {
  const comp = event.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === "home");
  const away = comp?.competitors?.find(c => c.homeAway === "away");
  const statusName = comp?.status?.type?.name ?? "STATUS_SCHEDULED";
  const state = comp?.status?.type?.state ?? "pre";
  const isCompleted = comp?.status?.type?.completed ?? false;
  const hasStarted = state === "in" || state === "post" || isCompleted;

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

/**
 * Check whether a specific team's game has already started.
 * Returns true = picks are locked for this team this week.
 */
export async function isPickLocked(sport: string, teamId: string, week?: number): Promise<boolean> {
  const games = await fetchGames(sport, week);
  const game = games.find(g => g.homeTeam.id === teamId || g.awayTeam.id === teamId);
  if (!game) return false;       // can't find game → allow pick (fail open)
  return game.hasStarted;
}

/**
 * Return map of teamId → true for every team whose game is final this week.
 * Used by results processing to determine winners/losers automatically.
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
    // tie → neither wins/loses in survivor context (leave pending)
  }

  return { winners, losers };
}

/**
 * Fetch this week's schedule — used by commissioner panel and pick grid.
 */
export { fetchGames };
