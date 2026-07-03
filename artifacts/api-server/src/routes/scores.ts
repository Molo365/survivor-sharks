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

const ESPN_SPORT_PATHS: Record<string, string> = {
  mlb:      "baseball/mlb",
  nfl:      "football/nfl",
  nba:      "basketball/nba",
  nhl:      "hockey/nhl",
  soccer:   "soccer/fifa.world",
  worldcup: "soccer/fifa.world",
};

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

// GET /api/scores/game/:gameId?sport=mlb|nfl|nba|nhl|soccer — public, no auth required
router.get("/game/:gameId", async (req, res) => {
  const gameId = String(req.params.gameId);
  const sport = String(req.query.sport ?? "");
  const espnPath = ESPN_SPORT_PATHS[sport];

  if (!espnPath) {
    res.status(400).json({ error: "Unknown sport. Use mlb, nfl, nba, nhl, or soccer." });
    return;
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/summary?event=${gameId}`;

  try {
    const espnRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!espnRes.ok) {
      res.status(502).json({ error: "ESPN summary unavailable" });
      return;
    }

    const d: any = await espnRes.json();
    const hdrComp: any = (d.header?.competitions ?? [])[0] ?? null;

    // ── Headline ──────────────────────────────────────────────────────────────
    const headline: string | null =
      hdrComp?.headlines?.[0]?.shortLinkText ??
      hdrComp?.headlines?.[0]?.description ??
      d.article?.headline ??
      null;

    // ── Venue ─────────────────────────────────────────────────────────────────
    const v = d.gameInfo?.venue;
    const venue: string | null = v
      ? [v.fullName, v.address?.city, v.address?.state].filter(Boolean).join(", ")
      : null;

    // ── Broadcasts ────────────────────────────────────────────────────────────
    const broadcastNames: string[] = [];
    const bSeen = new Set<string>();
    for (const b of d.broadcasts ?? []) {
      const name: string | undefined = b.station ?? b.media?.shortName ?? b.media?.name;
      if (name && !bSeen.has(name)) {
        broadcastNames.push(name);
        bSeen.add(name);
      }
    }
    // Also try scoreboard-style broadcasts on the competition
    for (const b of hdrComp?.broadcasts ?? []) {
      for (const name of b.names ?? []) {
        if (name && !bSeen.has(name)) {
          broadcastNames.push(name);
          bSeen.add(name);
        }
      }
    }

    // ── Linescore ─────────────────────────────────────────────────────────────
    type LinescoreResult = {
      columns: string[];
      home: (number | null)[];
      away: (number | null)[];
      homeLabel: string;
      awayLabel: string;
    } | null;

    let linescore: LinescoreResult = null;

    if (d.linescore) {
      const ls: any = d.linescore;
      const columns: string[] = (ls.columns ?? []).map((c: any) =>
        typeof c === "object" ? (c.displayValue ?? String(c)) : String(c),
      );
      const lines: any[] = ls.lines ?? [];

      const parseVal = (v: unknown): number | null => {
        if (v == null || v === "-" || v === "X" || v === "") return null;
        const n = parseInt(String(v), 10);
        return isNaN(n) ? null : n;
      };

      if (lines.length >= 2) {
        const awayLine: any = lines[0];
        const homeLine: any = lines[1];
        const awayVals = awayLine.displayValues ?? awayLine.values ?? [];
        const homeVals = homeLine.displayValues ?? homeLine.values ?? [];

        const hdrAway = hdrComp?.competitors?.find((c: any) => c.homeAway === "away");
        const hdrHome = hdrComp?.competitors?.find((c: any) => c.homeAway === "home");

        linescore = {
          columns,
          away: (awayVals as unknown[]).map(parseVal),
          home: (homeVals as unknown[]).map(parseVal),
          awayLabel:
            awayLine.team?.abbreviation ??
            hdrAway?.team?.abbreviation ??
            "AWAY",
          homeLabel:
            homeLine.team?.abbreviation ??
            hdrHome?.team?.abbreviation ??
            "HOME",
        };
      }
    }

    // ── Live situation ────────────────────────────────────────────────────────
    const statusState: string = hdrComp?.status?.type?.state ?? "pre";
    const isLive = statusState === "in";

    const plays: any[] = d.plays ?? [];
    const lastPlay: string | null =
      plays.length > 0 ? (plays[plays.length - 1]?.text ?? null) : null;

    type SituationResult = {
      balls: number;
      strikes: number;
      outs: number;
      onFirst: boolean;
      onSecond: boolean;
      onThird: boolean;
      batter: string | null;
      pitcher: string | null;
      lastPlay: string | null;
    } | null;

    let situation: SituationResult = null;
    if (isLive) {
      const sit: any = hdrComp?.situation ?? null;
      if (sit) {
        situation = {
          balls: sit.balls ?? 0,
          strikes: sit.strikes ?? 0,
          outs: sit.outs ?? 0,
          onFirst: sit.onFirst ?? false,
          onSecond: sit.onSecond ?? false,
          onThird: sit.onThird ?? false,
          batter:
            sit.batter?.athlete?.shortName ??
            sit.batter?.athlete?.fullName ??
            null,
          pitcher:
            sit.pitcher?.athlete?.shortName ??
            sit.pitcher?.athlete?.fullName ??
            null,
          lastPlay,
        };
      }
    }

    // ── Scoring summary ───────────────────────────────────────────────────────
    const scoringSummary: { period: string; description: string }[] = (
      d.scoring ?? []
    )
      .map((s: any) => ({
        period:
          s.period?.displayValue ??
          (s.period != null ? String(s.period) : ""),
        description:
          s.scoringPlay?.description ??
          s.text ??
          s.description ??
          "",
      }))
      .filter((s: { period: string; description: string }) => s.description);

    // ── Starting pitchers (MLB only) ──────────────────────────────────────────
    type PitcherResult = { name: string; era: string; record: string } | null;

    let homePitcher: PitcherResult = null;
    let awayPitcher: PitcherResult = null;

    if (sport === "mlb") {
      const extractPitcher = (comp: any): PitcherResult => {
        const probable = comp?.probables?.[0];
        if (!probable?.athlete?.fullName) return null;
        const stats: { name: string; displayValue: string }[] =
          Array.isArray(probable.statistics) ? probable.statistics : [];
        const era =
          stats.find(
            (s) => s.name === "ERA" || s.name === "era",
          )?.displayValue ?? "--";
        const record =
          stats.find(
            (s) => s.name === "record" || s.name === "Record",
          )?.displayValue ?? "--";
        return { name: probable.athlete.fullName, era, record };
      };

      const hdrAway = hdrComp?.competitors?.find(
        (c: any) => c.homeAway === "away",
      );
      const hdrHome = hdrComp?.competitors?.find(
        (c: any) => c.homeAway === "home",
      );
      awayPitcher = extractPitcher(hdrAway);
      homePitcher = extractPitcher(hdrHome);
    }

    // ── Odds ──────────────────────────────────────────────────────────────────
    const pc: any = (d.pickcenter ?? [])[0];
    const odds: string | null = pc?.details ?? null;

    res.json({
      gameId,
      headline,
      venue,
      broadcasts: broadcastNames,
      linescore,
      situation,
      scoringSummary,
      homePitcher,
      awayPitcher,
      odds,
    });
  } catch {
    res.status(502).json({ error: "Failed to fetch game detail" });
  }
});

export default router;
