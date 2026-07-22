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
  { sport: "mls",      label: "MLS",       emoji: "⚽" },
] as const;

type SportKey = "nfl" | "mlb" | "nba" | "nhl" | "worldcup";

const ESPN_SPORT_PATHS: Record<string, string> = {
  mlb:      "baseball/mlb",
  nfl:      "football/nfl",
  nba:      "basketball/nba",
  nhl:      "hockey/nhl",
  soccer:   "soccer/fifa.world",
  worldcup: "soccer/fifa.world",
  mls:      "soccer/usa.1",
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
    // d.linescore does not exist in the ESPN summary response.
    // Real data lives on hdrComp.competitors[i].linescores (per-inning runs)
    // and .score / .hits / .errors for the R/H/E totals.
    type LinescoreResult = {
      columns: string[];
      home: (number | null)[];
      away: (number | null)[];
      homeLabel: string;
      awayLabel: string;
    } | null;

    const awayComp: any = (hdrComp?.competitors ?? []).find(
      (c: any) => c.homeAway === "away",
    );
    const homeComp: any = (hdrComp?.competitors ?? []).find(
      (c: any) => c.homeAway === "home",
    );

    let linescore: LinescoreResult = null;
    const awayLines: any[] = awayComp?.linescores ?? [];
    const homeLines: any[] = homeComp?.linescores ?? [];
    if (awayLines.length > 0 || homeLines.length > 0) {
      const maxLen = Math.max(awayLines.length, homeLines.length);
      if (sport === "mlb") {
        const columns = [
          ...Array.from({ length: maxLen }, (_, i) => String(i + 1)),
          "R", "H", "E",
        ];
        const awayRow: (number | null)[] = [
          ...awayLines.map((l: any) =>
            l.displayValue === "X" ? null : Number(l.displayValue ?? null),
          ),
          ...Array(Math.max(0, maxLen - awayLines.length)).fill(null),
          Number(awayComp?.score ?? 0),
          Number(awayComp?.hits ?? 0),
          Number(awayComp?.errors ?? 0),
        ];
        const homeRow: (number | null)[] = [
          ...homeLines.map((l: any) =>
            l.displayValue === "X" ? null : Number(l.displayValue ?? null),
          ),
          ...Array(Math.max(0, maxLen - homeLines.length)).fill(null),
          Number(homeComp?.score ?? 0),
          Number(homeComp?.hits ?? 0),
          Number(homeComp?.errors ?? 0),
        ];
        linescore = {
          columns,
          awayLabel: awayComp?.team?.abbreviation ?? "AWY",
          homeLabel: homeComp?.team?.abbreviation ?? "HME",
          away: awayRow,
          home: homeRow,
        };
      } else {
        // Soccer, NHL, NBA, NFL — period-based columns, no R/H/E, append "T" total
        function periodLabel(value: number): string {
          if (sport === "soccer" || sport === "worldcup" || sport === "mls") {
            if (value === 1) return "1H";
            if (value === 2) return "2H";
            if (value === 3) return "AET";
            if (value === 4) return "PEN";
            return "P" + value;
          }
          if (sport === "nhl") {
            if (value === 1) return "1st";
            if (value === 2) return "2nd";
            if (value === 3) return "3rd";
            if (value === 4) return "OT";
            if (value === 5) return "SO";
            return "P" + value;
          }
          if (sport === "nba") {
            if (value === 1) return "Q1";
            if (value === 2) return "Q2";
            if (value === 3) return "Q3";
            if (value === 4) return "Q4";
            return "OT" + (value - 4);
          }
          // NFL (and fallback)
          if (value === 1) return "Q1";
          if (value === 2) return "Q2";
          if (value === 3) return "Q3";
          if (value === 4) return "Q4";
          if (value === 5) return "OT";
          return "OT" + (value - 4);
        }
        const columns = [
          ...Array.from({ length: maxLen }, (_, i) => {
            const l = awayLines[i] ?? homeLines[i];
            const value = l?.value != null ? Number(l.value) : i + 1;
            return periodLabel(value);
          }),
          "T",
        ];
        const awayRow: (number | null)[] = [
          ...awayLines.map((l: any) =>
            l.displayValue === "X" ? null : Number(l.displayValue ?? null),
          ),
          ...Array(Math.max(0, maxLen - awayLines.length)).fill(null),
          awayComp?.score != null ? Number(awayComp.score) : null,
        ];
        const homeRow: (number | null)[] = [
          ...homeLines.map((l: any) =>
            l.displayValue === "X" ? null : Number(l.displayValue ?? null),
          ),
          ...Array(Math.max(0, maxLen - homeLines.length)).fill(null),
          homeComp?.score != null ? Number(homeComp.score) : null,
        ];
        linescore = {
          columns,
          awayLabel: awayComp?.team?.abbreviation ?? "AWY",
          homeLabel: homeComp?.team?.abbreviation ?? "HME",
          away: awayRow,
          home: homeRow,
        };
      }
    }

    // ── Live situation ────────────────────────────────────────────────────────
    // The summary endpoint's d.situation is a stripped stub (no athlete names,
    // no base flags, no lastPlay text). The scoreboard endpoint has everything.
    // For live games, fetch the scoreboard in parallel and pull
    // competitions[0].situation from the matching event.
    const statusState: string = hdrComp?.status?.type?.state ?? "pre";
    const isLive = statusState === "in";

    // "Top 8th", "Bot 3rd", "End 5th" — null for pre/post games
    const inning: string | null = hdrComp?.status?.type?.detail ?? null;

    const plays: any[] = d.plays ?? [];
    const lastPlayFallback: string | null =
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
      try {
        const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard`;
        const sbRes = await fetch(sbUrl, { signal: AbortSignal.timeout(6000) });
        if (sbRes.ok) {
          const sb: any = await sbRes.json();
          const sbEvent = (sb.events ?? []).find((e: any) => e.id === gameId);
          const sbSit: any =
            (sbEvent?.competitions ?? [])[0]?.situation ?? null;
          if (sbSit) {
            situation = {
              balls:    sbSit.balls    ?? 0,
              strikes:  sbSit.strikes  ?? 0,
              outs:     sbSit.outs     ?? 0,
              onFirst:  sbSit.onFirst  ?? false,
              onSecond: sbSit.onSecond ?? false,
              onThird:  sbSit.onThird  ?? false,
              batter:
                sbSit.batter?.athlete?.shortName ??
                sbSit.batter?.athlete?.fullName ??
                null,
              pitcher:
                sbSit.pitcher?.athlete?.shortName ??
                sbSit.pitcher?.athlete?.fullName ??
                null,
              lastPlay:
                sbSit.lastPlay?.text ??
                lastPlayFallback,
            };
          }
        }
      } catch {
        // scoreboard fetch failed — leave situation as null
      }
    }

    // ── Scoring summary ───────────────────────────────────────────────────────
    // d.scoring does not exist in the ESPN summary response.
    // Scoring plays live in d.plays filtered by scoringPlay === true.
    const scoringSummary: { period: string; description: string }[] = (
      d.plays ?? []
    )
      .filter((p: any) => p.scoringPlay === true)
      .map((p: any) => ({
        period: p.period?.displayValue ?? "",
        description: p.text ?? "",
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
        // probable.statistics is { splits: { categories: [] } }, not an array
        const categories: any[] =
          probable.statistics?.splits?.categories ?? [];
        const era =
          categories.find((c: any) => c.name === "ERA")?.displayValue ?? "--";
        const wins =
          categories.find((c: any) => c.name === "wins")?.displayValue ?? null;
        const losses =
          categories.find((c: any) => c.name === "losses")?.displayValue ??
          null;
        const record =
          wins !== null && losses !== null ? `${wins}-${losses}` : "--";
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
      inning,
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

// ── Sport standings configuration ─────────────────────────────────────────────
//
// Maps the sport key (same keys used in /today) to:
//   url        — ESPN v2 standings endpoint
//               MLB and NFL require ?level=3 to get division-level grouping;
//               without it ESPN returns a flat league/conference list.
//   extraStat  — optional 3rd column stat name (otLosses for NHL, ties for MLS/NFL)
//   extraLabel — column header label for that stat
//   pctStat    — "winPercent" (MLB/NBA/NFL) or "points" (NHL/MLS)
//   pctLabel   — column header label
//   sortStat   — raw stat name to sort team entries within each group
//   sortDir    — "asc" (playoffSeed: 1 = leader) or "desc" (points: higher = better)

const STANDINGS_CONFIG: Record<string, {
  url: string;
  extraStat: string | null;
  extraLabel: string;
  pctStat: string;
  pctLabel: string;
  sortStat: string;
  sortDir: "asc" | "desc";
}> = {
  mlb: {
    // level=3 → Major League Baseball → AL/NL → East/Central/West → 5 teams each
    url: "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?level=3",
    extraStat: null,
    extraLabel: "",
    pctStat: "winPercent",
    pctLabel: "PCT",
    sortStat: "playoffSeed",
    sortDir: "asc",
  },
  nhl: {
    url: "https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings",
    extraStat: "otLosses",
    extraLabel: "OT",
    pctStat: "points",
    pctLabel: "PTS",
    sortStat: "points",
    sortDir: "desc",
  },
  nba: {
    url: "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings",
    extraStat: null,
    extraLabel: "",
    pctStat: "winPercent",
    pctLabel: "PCT",
    sortStat: "playoffSeed",
    sortDir: "asc",
  },
  mls: {
    // ESPN returns teams in arbitrary insertion order — must sort by points desc
    url: "https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings",
    extraStat: "ties",
    extraLabel: "T",
    pctStat: "points",
    pctLabel: "PTS",
    sortStat: "points",
    sortDir: "desc",
  },
  nfl: {
    // level=3 → NFL → AFC/NFC → 4 divisions each → 4 teams each
    url: "https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3",
    extraStat: "ties",
    extraLabel: "T",
    pctStat: "winPercent",
    pctLabel: "PCT",
    sortStat: "playoffSeed",
    sortDir: "asc",
  },
};

// GET /api/scores/standings/:sport — public, no auth required
router.get("/standings/:sport", async (req, res) => {
  const sport = String(req.params.sport);
  const config = STANDINGS_CONFIG[sport];

  if (!config) {
    res.status(400).json({ error: "Standings not available for this sport" });
    return;
  }

  try {
    const espnRes = await fetch(config.url, { signal: AbortSignal.timeout(8000) });
    if (!espnRes.ok) {
      res.status(502).json({ error: "ESPN standings unavailable" });
      return;
    }

    const raw = await espnRes.json() as Record<string, unknown>;

    const getStat = (
      stats: Array<{ name: string; displayValue: string; value?: number }> | undefined,
      name: string,
    ) => stats?.find(s => s.name === name);

    const parseEntries = (entries: Array<{
      team: { abbreviation: string; displayName: string; logos?: { href: string }[] };
      stats?: Array<{ name: string; displayValue: string; value?: number }>;
    }>) => {
      // Sort entries within each group by the configured stat before mapping
      const sorted = [...entries].sort((a, b) => {
        const av = getStat(a.stats, config.sortStat)?.value ?? 0;
        const bv = getStat(b.stats, config.sortStat)?.value ?? 0;
        return config.sortDir === "asc" ? av - bv : bv - av;
      });
      return sorted.map(e => {
        const st = e.stats ?? [];
        const extraVal = config.extraStat ? (getStat(st, config.extraStat)?.value ?? 0) : null;
        const pctRaw = getStat(st, config.pctStat);
        const pct = pctRaw?.displayValue ?? (pctRaw?.value != null ? String(pctRaw.value) : "—");
        const gbRaw = getStat(st, "gamesBehind");
        const gb = gbRaw?.displayValue ?? (gbRaw?.value != null ? String(gbRaw.value) : "-");
        return {
          abbrev: e.team.abbreviation,
          displayName: e.team.displayName,
          logo: (e.team.logos?.[0]?.href) ?? null,
          w: getStat(st, "wins")?.value ?? 0,
          l: getStat(st, "losses")?.value ?? 0,
          extra: extraVal !== null ? String(extraVal) : null,
          extraLabel: config.extraLabel || null,
          pct,
          pctLabel: config.pctLabel,
          gb,
        };
      });
    };

    type StandingsGroup = { name: string; teams: ReturnType<typeof parseEntries> };
    const groups: StandingsGroup[] = [];

    // ESPN v2 standings can be 2-level (conf → entries) or 3-level (conf → div → entries)
    for (const child of (raw.children as Array<Record<string, unknown>>) ?? []) {
      const subChildren = child.children as Array<Record<string, unknown>> | undefined;
      if (subChildren?.length) {
        for (const sub of subChildren) {
          const entries = ((sub.standings as Record<string, unknown>)?.entries as Array<unknown>) ?? [];
          if (entries.length > 0) {
            groups.push({ name: sub.name as string, teams: parseEntries(entries as Parameters<typeof parseEntries>[0]) });
          }
        }
      } else {
        const entries = ((child.standings as Record<string, unknown>)?.entries as Array<unknown>) ?? [];
        if (entries.length > 0) {
          groups.push({ name: child.name as string, teams: parseEntries(entries as Parameters<typeof parseEntries>[0]) });
        }
      }
    }

    res.json({ sport, groups });
  } catch {
    res.status(502).json({ error: "Failed to fetch standings" });
  }
});

export default router;
