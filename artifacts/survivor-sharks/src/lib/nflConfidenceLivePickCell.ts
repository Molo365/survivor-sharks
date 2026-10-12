import type { GameSummary, PlayerPick } from "@/components/nflConfidenceLiveTypes";

export type ConfidenceLiveCellState =
  | "hidden"
  | "correct"
  | "incorrect"
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

export function pickTeamAbbreviation(pick: PlayerPick, game: GameSummary): string {
  if (!pick.pickedTeamId) return "—";
  if (pick.pickedTeamId === game.homeTeam.id) return game.homeTeam.abbreviation;
  if (pick.pickedTeamId === game.awayTeam.id) return game.awayTeam.abbreviation;
  return pick.pickedTeamName?.slice(0, 3).toUpperCase() ?? "—";
}

export function resolveNflConfidenceLivePickCell(
  pick: PlayerPick | undefined,
  game: GameSummary,
): {
  state: ConfidenceLiveCellState;
  abbr: string | null;
  points: number | null;
} {
  if (!pick?.pickedTeamId) {
    return { state: "hidden", abbr: null, points: null };
  }

  const abbr = pickTeamAbbreviation(pick, game);
  const points = pick.confidencePoints;

  const result = pick.result ?? null;
  if (result === "correct") return { state: "correct", abbr, points };
  if (result === "incorrect") return { state: "incorrect", abbr, points };

  if (
    game.status !== "in_progress" ||
    game.awayScore == null ||
    game.homeScore == null
  ) {
    return { state: "pending", abbr, points };
  }

  const grade = gradeStraightPick({
    pickedTeamId: pick.pickedTeamId,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeTeamId: game.homeTeam.id,
    awayTeamId: game.awayTeam.id,
  });

  if (grade === "push") return { state: "pending", abbr, points };
  if (grade === "correct") return { state: "live_winning", abbr, points };
  return { state: "live_losing", abbr, points };
}

export function formatConfidenceGameStatusLabel(game: GameSummary): string {
  if (game.status === "final") return "FINAL";
  if (game.status === "in_progress") return "LIVE";
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
