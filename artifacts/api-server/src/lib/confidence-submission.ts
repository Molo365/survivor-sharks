export interface ConfidenceSubmissionPick {
  gameId: string;
  pickedTeamId: string;
  confidencePoints: number;
}

export interface ConfidenceSubmissionGame {
  id: string;
  date: string;
  homeTeam: { id: string };
  awayTeam: { id: string };
}

export type ConfidenceSubmissionValidation =
  | { ok: true }
  | { ok: false; error: string };

export function sortConfidenceGamesByKickoff<T extends ConfidenceSubmissionGame>(games: T[]): T[] {
  return [...games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function validateConfidenceSubmission({
  picks,
  games,
  nowMs = Date.now(),
}: {
  picks: ConfidenceSubmissionPick[];
  games: ConfidenceSubmissionGame[];
  nowMs?: number;
}): ConfidenceSubmissionValidation {
  const expectedCount = games.length;
  if (expectedCount === 0) {
    return { ok: false, error: "All of this week's games have already started." };
  }
  if (picks.length !== expectedCount) {
    return { ok: false, error: `Expected ${expectedCount} picks, got ${picks.length}` };
  }

  const gameMap = new Map(games.map((game) => [game.id, game]));
  const submittedGameIds = new Set<string>();
  for (const pick of picks) {
    const game = gameMap.get(pick.gameId);
    if (!game) {
      return { ok: false, error: `Unknown game: ${pick.gameId}` };
    }
    if (submittedGameIds.has(pick.gameId)) {
      return { ok: false, error: `Duplicate game: ${pick.gameId}` };
    }
    submittedGameIds.add(pick.gameId);
    if (new Date(game.date).getTime() <= nowMs) {
      return { ok: false, error: `Game ${pick.gameId} has already locked` };
    }
    if (pick.pickedTeamId !== game.homeTeam.id && pick.pickedTeamId !== game.awayTeam.id) {
      return { ok: false, error: `Invalid team for game ${pick.gameId}` };
    }
  }

  const confidencePoints = picks.map((pick) => pick.confidencePoints).sort((a, b) => a - b);
  if (!confidencePoints.every((value, index) => value === index + 1)) {
    return {
      ok: false,
      error: `Confidence points 1-${expectedCount} must each be used exactly once`,
    };
  }

  return { ok: true };
}