import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { fetchSoccerMatchupForm, fetchSoccerTeamForm } from "../lib/soccer-team-form";

const router: IRouter = Router();

const ALLOWED_SPORTS = new Set([
  "championsleague",
  "mls",
  "superleague",
  "worldcup",
  "intl",
]);

// GET /api/soccer/team-form?teamId=&sport=championsleague
router.get("/team-form", requireAuth, async (req, res) => {
  const teamId = String(req.query.teamId ?? "").trim();
  const sport = String(req.query.sport ?? "championsleague").trim();

  if (!teamId || !/^\d+$/.test(teamId)) {
    res.status(400).json({ error: "teamId must be a numeric ESPN id" });
    return;
  }
  if (!ALLOWED_SPORTS.has(sport)) {
    res.status(400).json({ error: "Unsupported sport for team form" });
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=300");

  try {
    const matches = await fetchSoccerTeamForm({ teamId, sport });
    res.json({ teamId, sport, matches });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to load team form",
    });
  }
});

// GET /api/soccer/matchup-form?awayTeamId=&homeTeamId=&sport=championsleague
router.get("/matchup-form", requireAuth, async (req, res) => {
  const awayTeamId = String(req.query.awayTeamId ?? "").trim();
  const homeTeamId = String(req.query.homeTeamId ?? "").trim();
  const sport = String(req.query.sport ?? "championsleague").trim();

  if (!awayTeamId || !homeTeamId) {
    res.status(400).json({ error: "awayTeamId and homeTeamId are required" });
    return;
  }
  if (!/^\d+$/.test(awayTeamId) || !/^\d+$/.test(homeTeamId)) {
    res.status(400).json({ error: "team ids must be numeric ESPN ids" });
    return;
  }
  if (!ALLOWED_SPORTS.has(sport)) {
    res.status(400).json({ error: "Unsupported sport for team form" });
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=300");

  try {
    const payload = await fetchSoccerMatchupForm({ awayTeamId, homeTeamId, sport });
    res.json({ sport, ...payload });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to load matchup form",
    });
  }
});

export default router;