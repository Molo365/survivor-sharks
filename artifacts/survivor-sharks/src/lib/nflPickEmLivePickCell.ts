import type {
  NflPickEmSeasonGame,
  NflPickEmSeasonPlayerPick,
} from "@workspace/api-client-react";

export type LivePickCellState =
  | "hidden"
  | "correct"
  | "incorrect"
  | "push"
  | "pending"
  | "live_winning"
  | "live_losing";

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

export function pickTeamAbbreviation(
  pick: NflPickEmSeasonPlayerPick,
  game: NflPickEmSeasonGame,
): string {
  if (pick.pickedTeamId === game.homeTeam.id) return game.homeTeam.abbreviation;
  if (pick.pickedTeamId === game.awayTeam.id) return game.awayTeam.abbreviation;
  return pick.pickedTeamName.slice(0, 3).toUpperCase();
}

export function resolveNflPickEmLivePickCellState(
  pick: NflPickEmSeasonPlayerPick | undefined,
  game: NflPickEmSeasonGame,
  scoringMode: "straight" | "ats",
): { state: LivePickCellState; abbr: string | null } {
  if (!pick?.pickedTeamId) {
    return { state: "hidden", abbr: null };
  }

  const abbr = pickTeamAbbreviation(pick, game);
  const result = pick.result ?? null;

  if (result === "correct") return { state: "correct", abbr };
  if (result === "incorrect") return { state: "incorrect", abbr };
  if (result === "push") return { state: "push", abbr };

  if (
    game.status !== "in_progress" ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return { state: "pending", abbr };
  }

  let grade: "correct" | "incorrect" | "push";
  if (
    scoringMode === "ats" &&
    game.spread != null &&
    game.favoriteTeamId
  ) {
    grade = gradeAtsPick({
      pickedTeamId: pick.pickedTeamId,
      favoriteTeamId: game.favoriteTeamId,
      spread: game.spread,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamId: game.homeTeam.id,
    });
  } else {
    grade = gradeStraightPick({
      pickedTeamId: pick.pickedTeamId,
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

export function formatNflLiveGameStatusLabel(game: NflPickEmSeasonGame): string {
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

export function formatSecondsAgo(updatedAtMs: number): string {
  const sec = Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}
