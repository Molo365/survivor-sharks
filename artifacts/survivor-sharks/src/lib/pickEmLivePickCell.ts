import type { PickEmPlayerPick } from "@workspace/api-client-react";
import { getVisiblePickEmPick } from "@/lib/pickReveal";

export type PickEmLiveGame = {
  id: string;
  startTime: string;
  status: string;
  liveDetail?: string | null;
  awayScore?: number | null;
  homeScore?: number | null;
  awayTeam: { id: string; abbreviation: string };
  homeTeam: { id: string; abbreviation: string };
  /** ATS pools — line frozen at pick time (from slate / games API) */
  spread?: number | null;
  favoriteTeamId?: string | null;
};

export type PickEmLiveScoringMode = "straight" | "ats" | "three_way";

const THREE_WAY_PICK_IDS = ["home_win", "draw", "away_win"] as const;

function isThreeWayPickId(pickedTeamId: string): boolean {
  return (THREE_WAY_PICK_IDS as readonly string[]).includes(pickedTeamId);
}

function gradeThreeWayPick(params: {
  pickedTeamId: string;
  homeScore: number;
  awayScore: number;
}): "correct" | "incorrect" {
  const { pickedTeamId, homeScore, awayScore } = params;
  const actual =
    homeScore === awayScore
      ? "draw"
      : homeScore > awayScore
        ? "home_win"
        : "away_win";
  return pickedTeamId === actual ? "correct" : "incorrect";
}

function gradeStraightPick(params: {
  pickedTeamId: string;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
}): "correct" | "incorrect" | "push" {
  const { pickedTeamId, homeScore, awayScore, homeTeamId, awayTeamId } = params;
  if (homeScore === awayScore) return "push";
  const winnerTeamId = homeScore > awayScore ? homeTeamId : awayTeamId;
  return pickedTeamId === winnerTeamId ? "correct" : "incorrect";
}

function gradeAtsPick(params: {
  pickedTeamId: string;
  favoriteTeamId: string;
  spread: number;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
}): "correct" | "incorrect" | "push" {
  const { pickedTeamId, favoriteTeamId, spread, homeScore, awayScore, homeTeamId } = params;
  const favoriteIsHome = favoriteTeamId === homeTeamId;
  const homeMargin = homeScore - awayScore;
  const favoriteMargin = favoriteIsHome ? homeMargin : -homeMargin;
  if (favoriteMargin === spread) return "push";
  const pickedFavorite = pickedTeamId === favoriteTeamId;
  return pickedFavorite
    ? favoriteMargin > spread
      ? "correct"
      : "incorrect"
    : favoriteMargin < spread
      ? "correct"
      : "incorrect";
}

export type PickEmLiveCellState =
  | "hidden"
  | "correct"
  | "incorrect"
  | "push"
  | "pending"
  | "live_winning"
  | "live_losing";

function pickAbbr(
  pick: PickEmPlayerPick,
  game: PickEmLiveGame,
  scoringMode: PickEmLiveScoringMode,
): string {
  const id = pick.pickedTeamId;
  if (!id) return pick.pickedTeamName.slice(0, 3).toUpperCase();
  if (scoringMode === "three_way" || isThreeWayPickId(id)) {
    if (id === "draw") return "D";
    if (id === "home_win") return game.homeTeam.abbreviation;
    if (id === "away_win") return game.awayTeam.abbreviation;
  }
  if (id === game.homeTeam.id) return game.homeTeam.abbreviation;
  if (id === game.awayTeam.id) return game.awayTeam.abbreviation;
  return pick.pickedTeamName.slice(0, 3).toUpperCase();
}

export function formatPickEmLiveGameStatusLabel(game: PickEmLiveGame): string {
  if (game.status === "final") return "FINAL";
  if (game.status === "in_progress") {
    return game.liveDetail?.trim() || "LIVE";
  }
  if (!game.startTime) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    })
      .format(new Date(game.startTime))
      .replace(/\s/g, "")
      .toLowerCase();
  } catch {
    return "—";
  }
}

export function resolvePickEmLivePickCell(
  pick: PickEmPlayerPick | undefined,
  game: PickEmLiveGame,
  opts: {
    entryUserId: number;
    currentUserId: number | null;
    scoringMode?: PickEmLiveScoringMode;
  },
): { state: PickEmLiveCellState; abbr: string | null } {
  const scoringMode = opts.scoringMode ?? "straight";
  const visible = getVisiblePickEmPick(pick, {
    entryUserId: opts.entryUserId,
    currentUserId: opts.currentUserId,
    gameStartTime: game.startTime,
  });

  if (!visible?.pickedTeamId) {
    return { state: "hidden", abbr: null };
  }

  const abbr = pickAbbr(visible, game, scoringMode);
  const result = visible.result ?? "pending";

  if (result === "correct") return { state: "correct", abbr };
  if (result === "incorrect") return { state: "incorrect", abbr };
  if (result === "push") return { state: "push", abbr };
  if (result === "postponed") return { state: "pending", abbr };

  const inProgress =
    game.status === "in_progress" ||
    game.status?.toUpperCase() === "STATUS_IN_PROGRESS";

  if (
    !inProgress ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return { state: "pending", abbr };
  }

  const effectiveMode: PickEmLiveScoringMode =
    scoringMode === "straight" && isThreeWayPickId(visible.pickedTeamId)
      ? "three_way"
      : scoringMode;

  if (effectiveMode === "three_way") {
    const grade = gradeThreeWayPick({
      pickedTeamId: visible.pickedTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    });
    return grade === "correct"
      ? { state: "live_winning", abbr }
      : { state: "live_losing", abbr };
  }

  let grade: "correct" | "incorrect" | "push";
  if (
    scoringMode === "ats" &&
    game.spread != null &&
    game.favoriteTeamId
  ) {
    grade = gradeAtsPick({
      pickedTeamId: visible.pickedTeamId,
      favoriteTeamId: game.favoriteTeamId,
      spread: game.spread,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamId: game.homeTeam.id,
    });
  } else {
    grade = gradeStraightPick({
      pickedTeamId: visible.pickedTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamId: game.homeTeam.id,
      awayTeamId: game.awayTeam.id,
    });
  }

  if (grade === "push") return { state: "pending", abbr };
  if (grade === "correct") return { state: "live_winning", abbr };
  return { state: "live_losing", abbr };
}
