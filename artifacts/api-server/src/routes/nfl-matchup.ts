import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { buildNflMatchupPayload } from "../lib/nfl-matchup";

const router: IRouter = Router();

// GET /api/nfl/matchup?awayTeamId=&homeTeamId=&season=&eventId=
router.get("/", requireAuth, async (req, res) => {
  const awayTeamId = String(req.query.awayTeamId ?? "").trim();
  const homeTeamId = String(req.query.homeTeamId ?? "").trim();
  const eventId = req.query.eventId != null ? String(req.query.eventId).trim() : null;

  if (!awayTeamId || !homeTeamId) {
    res.status(400).json({ error: "awayTeamId and homeTeamId are required" });
    return;
  }
  if (!/^\d+$/.test(awayTeamId) || !/^\d+$/.test(homeTeamId)) {
    res.status(400).json({ error: "team ids must be numeric ESPN ids" });
    return;
  }

  const seasonRaw = req.query.season;
  const season =
    seasonRaw === undefined || seasonRaw === ""
      ? new Date().getFullYear()
      : Number(seasonRaw);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    res.status(400).json({ error: "season must be a valid year" });
    return;
  }

  const seasontypeRaw = req.query.seasontype;
  const seasontype =
    seasontypeRaw === undefined || seasontypeRaw === "" ? 2 : Number(seasontypeRaw);
  if (![1, 2, 3].includes(seasontype)) {
    res.status(400).json({ error: "seasontype must be 1, 2, or 3" });
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=300");

  try {
    const payload = await buildNflMatchupPayload({
      awayTeamId,
      homeTeamId,
      season,
      seasontype,
      eventId,
    });
    res.json(payload);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to load matchup",
    });
  }
});

export default router;