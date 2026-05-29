import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { ESPN_TEAMS, getTeamLogoUrl, type Sport } from "../lib/teams-data";

const router = Router();

// GET /api/sports/:sport/teams
router.get("/:sport/teams", requireAuth, (req, res) => {
  const sport = String(req.params.sport) as Sport;
  const teams = ESPN_TEAMS[sport];

  if (!teams) {
    res.status(404).json({ error: "Unknown sport" });
    return;
  }

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

  try {
    const espnSport = sport === "nfl" ? "football/nfl" :
      sport === "nba" ? "basketball/nba" :
      sport === "mlb" ? "baseball/mlb" :
      sport === "nhl" ? "hockey/nhl" :
      "soccer/fifa.worldq.concacaf";

    const url = sport === "nfl"
      ? `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/scoreboard?week=${week}&seasontype=2`
      : `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/scoreboard`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      type EspnCompetitor = { homeAway: string; score?: string; team: { id: string; displayName: string; abbreviation: string; logo: string } };
      type EspnEvent = { id: string; date: string; competitions?: { competitors?: EspnCompetitor[]; status?: { type?: { completed: boolean; name: string } } }[] };
      const data = await response.json() as { events?: EspnEvent[] };
      const games = (data.events ?? []).map((event: EspnEvent) => {
        const comp = event.competitions?.[0];
        const home = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
        const away = comp?.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");
        const statusName = comp?.status?.type?.name ?? "scheduled";
        return {
          id: event.id,
          sport,
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
          startTime: event.date,
          week,
          season: new Date().getFullYear(),
          status: statusName,
          homeScore: home?.score ? parseInt(home.score) : null,
          awayScore: away?.score ? parseInt(away.score) : null,
        };
      });

      res.json(games);
      return;
    }
  } catch {
    // Fall through to static fallback
  }

  // Fallback: return teams as a placeholder schedule
  const teams = ESPN_TEAMS[sport] ?? [];
  const games = [];
  for (let i = 0; i < teams.length - 1; i += 2) {
    games.push({
      id: `${sport}-week${week}-${i}`,
      sport,
      homeTeam: {
        id: teams[i].id,
        name: teams[i].name,
        abbreviation: teams[i].abbreviation,
        sport,
        logoUrl: getTeamLogoUrl(sport, teams[i]),
        location: teams[i].location,
        conference: teams[i].conference ?? null,
        division: teams[i].division ?? null,
        flagUrl: null,
      },
      awayTeam: {
        id: teams[i + 1].id,
        name: teams[i + 1].name,
        abbreviation: teams[i + 1].abbreviation,
        sport,
        logoUrl: getTeamLogoUrl(sport, teams[i + 1]),
        location: teams[i + 1].location,
        conference: teams[i + 1].conference ?? null,
        division: teams[i + 1].division ?? null,
        flagUrl: null,
      },
      startTime: new Date().toISOString(),
      week,
      season: new Date().getFullYear(),
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    });
  }

  res.json(games);
});

export default router;
