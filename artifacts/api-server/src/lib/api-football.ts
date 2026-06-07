/**
 * API-Football v3 client for international soccer fixtures.
 *
 * Used for intl pools — league 10 = International Friendlies.
 * https://www.api-football.com/documentation-v3
 *
 * Auth: x-apisports-key header (API_FOOTBALL_KEY env var)
 */

import type { EspnGame, EspnTeam } from "./espn";
import { logger } from "./logger";

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

// Leagues to pull for intl pools (fetched in parallel, merged + deduped)
const INTL_LEAGUE_IDS = [
  10,   // International Friendlies
];

function getApiKey(): string | null {
  return process.env.API_FOOTBALL_KEY ?? null;
}

type ApifStatus = {
  short: string;      // "NS", "1H", "HT", "2H", "ET", "BT", "P", "FT", "AET", "PEN", "SUSP", "INT", "PST", "CANC", "ABD", "AWD", "WO"
  elapsed: number | null;
};

type ApifFixture = {
  fixture: { id: number; date: string; status: ApifStatus };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
};

function mapStatus(short: string): "scheduled" | "in_progress" | "final" | "postponed" {
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(short)) return "final";
  if (["PST", "CANC", "ABD"].includes(short)) return "postponed";
  if (["NS", "TBD", "SUSP"].includes(short)) return "scheduled";
  return "in_progress";
}

function makeAbbr(name: string): string {
  // Use up to 3 consonants/first-chars for a compact abbreviation
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  // Multi-word: take first letter of each word (up to 3)
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function mapFixture(f: ApifFixture): EspnGame {
  const short = f.fixture.status.short;
  const status = mapStatus(short);
  const isCompleted = status === "final";
  const isPostponed = status === "postponed";
  const hasStarted = short !== "NS" && short !== "TBD" && !isPostponed;

  const homeTeam: EspnTeam = {
    id: `apif-team-${f.teams.home.id}`,
    abbreviation: makeAbbr(f.teams.home.name),
    displayName: f.teams.home.name,
    logo: f.teams.home.logo ?? undefined,
  };
  const awayTeam: EspnTeam = {
    id: `apif-team-${f.teams.away.id}`,
    abbreviation: makeAbbr(f.teams.away.name),
    displayName: f.teams.away.name,
    logo: f.teams.away.logo ?? undefined,
  };

  const liveDetail =
    status === "in_progress"
      ? `${short}${f.fixture.status.elapsed != null ? ` ${f.fixture.status.elapsed}'` : ""}`
      : null;

  return {
    id: `apif-${f.fixture.id}`,
    date: f.fixture.date,
    status,
    homeTeam,
    awayTeam,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    homeRecord: null,
    awayRecord: null,
    isCompleted,
    isPostponed,
    hasStarted,
    liveState: liveDetail
      ? {
          inning: 0,
          isTopInning: false,
          outs: 0,
          onFirst: false,
          onSecond: false,
          onThird: false,
          currentBatter: null,
          currentPitcher: null,
          shortDetail: liveDetail,
        }
      : null,
    homeStartingPitcher: null,
    awayStartingPitcher: null,
    groupLabel: null,
  };
}

async function fetchLeagueFixtures(
  leagueId: number,
  season: number,
  date: string,
  key: string,
): Promise<EspnGame[]> {
  const url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&date=${date}`;
  try {
    const r = await fetch(url, {
      headers: { "x-apisports-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      logger.warn({ status: r.status, url }, "API-Football: non-OK response");
      return [];
    }
    const body = (await r.json()) as { response?: ApifFixture[] };
    return (body.response ?? []).map(mapFixture);
  } catch (err) {
    logger.warn({ err, url }, "API-Football: fetch error");
    return [];
  }
}

/**
 * Fetch international soccer fixtures for a given date from API-Football.
 *
 * dateStr — YYYYMMDD (same format used throughout the pick-em stack).
 *
 * Tries the current calendar year first; if no results, falls back to
 * the previous year (handles Jan/Feb where fixtures still fall in the
 * prior season for some leagues).
 */
export async function fetchApiFootballIntlFixtures(dateStr: string): Promise<EspnGame[]> {
  const key = getApiKey();
  if (!key) {
    logger.warn("API_FOOTBALL_KEY not set — intl fixtures unavailable");
    return [];
  }

  // Convert YYYYMMDD → YYYY-MM-DD for API-Football
  const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const year = parseInt(dateStr.slice(0, 4), 10);

  // Try current year; if empty, try previous year (season boundary safety net)
  const primaryResults = await Promise.all(
    INTL_LEAGUE_IDS.map((id) => fetchLeagueFixtures(id, year, date, key)),
  );

  const seen = new Set<string>();
  const games: EspnGame[] = [];

  const addGames = (list: EspnGame[]) => {
    for (const g of list) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        games.push(g);
      }
    }
  };

  for (const list of primaryResults) addGames(list);

  // If nothing found, try season = year - 1 (some leagues run Aug–Jun)
  if (games.length === 0) {
    const fallbackResults = await Promise.all(
      INTL_LEAGUE_IDS.map((id) => fetchLeagueFixtures(id, year - 1, date, key)),
    );
    for (const list of fallbackResults) addGames(list);
  }

  logger.info({ date, count: games.length }, "API-Football: intl fixtures fetched");
  return games;
}
