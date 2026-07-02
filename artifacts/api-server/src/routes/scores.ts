import { Router } from "express";
import {
  getTodayEtDate,
  formatDateEt,
  fetchGamesForDate,
  type EspnGame,
} from "../lib/espn";

const router = Router();

const SPORTS = [
  { sport: "mlb",       label: "MLB",      emoji: "⚾" },
  { sport: "nba",       label: "NBA",      emoji: "🏀" },
  { sport: "nhl",       label: "NHL",      emoji: "🏒" },
  { sport: "nfl",       label: "NFL",      emoji: "🏈" },
  { sport: "worldcup", label: "World Cup", emoji: "⚽" },
] as const;

type SportKey = "nfl" | "mlb" | "nba" | "nhl" | "worldcup";

// GET /api/scores/today — public, no auth required
router.get("/today", async (_req, res) => {
  const todayEt = getTodayEtDate();
  const todayEspnDate = formatDateEt(new Date(todayEt + "T12:00:00"));

  const results = await Promise.allSettled(
    SPORTS.map(({ sport }) => fetchGamesForDate(sport, todayEspnDate)),
  );

  const sports: {
    sport: SportKey;
    label: string;
    emoji: string;
    games: EspnGame[];
  }[] = [];

  for (let i = 0; i < SPORTS.length; i++) {
    const meta = SPORTS[i]!;
    const result = results[i]!;
    const games = result.status === "fulfilled" ? result.value : [];
    if (games.length === 0) continue;

    const sportKey: SportKey = meta.sport as SportKey;

    sports.push({ sport: sportKey, label: meta.label, emoji: meta.emoji, games });
  }

  res.json({ date: todayEt, sports });
});

export default router;
