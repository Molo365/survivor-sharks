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
};

export type PickEmLiveCellState =
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

function pickAbbr(pick: PickEmPlayerPick, game: PickEmLiveGame): string {
  if (pick.pickedTeamId === game.homeTeam.id) return game.homeTeam.abbreviation;
  if (pick.pickedTeamId === game.awayTeam.id) return game.awayTeam.abbreviation;
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
  opts: { entryUserId: number; currentUserId: number | null },
): { state: PickEmLiveCellState; abbr: string | null } {
  const visible = getVisiblePickEmPick(pick, {
    entryUserId: opts.entryUserId,
    currentUserId: opts.currentUserId,
    gameStartTime: game.startTime,
  });

  if (!visible?.pickedTeamId) {
    return { state: "hidden", abbr: null };
  }

  const abbr = pickAbbr(visible, game);
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

  const grade = gradeStraightPick({
    pickedTeamId: visible.pickedTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeTeamId: game.homeTeam.id,
    awayTeamId: game.awayTeam.id,
  });

  if (grade === "push") return { state: "pending", abbr };
  if (grade === "correct") return { state: "live_winning", abbr };
  return { state: "live_losing", abbr };
}
