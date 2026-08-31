import type { EspnGame } from "./espn";

export type NflAutoAdvanceBlockReason =
  | "terminal-week"
  | "empty-slate"
  | "mismatched-slate"
  | "unfinished-slate";

export type NflAutoAdvanceDecision =
  | { canAdvance: true }
  | { canAdvance: false; reason: NflAutoAdvanceBlockReason };

type NflSlateGame = Pick<
  EspnGame,
  "seasonType" | "seasonYear" | "weekNumber" | "status" | "isCompleted" | "isPostponed"
>;

interface ExpectedNflSlate {
  expectedSeason: number;
  expectedSeasonType: 1 | 2;
  expectedWeek: number;
}

interface EvaluateNflAutoAdvanceSlateOptions {
  games: NflSlateGame[];
  currentWeek: number;
  expectedSeason: number;
  expectedSeasonType: 1 | 2;
  terminalWeek: number;
}

export function isNflGameFromRequestedSlate(
  game: NflSlateGame,
  expected: ExpectedNflSlate,
): boolean {
  return (
    game.seasonType === expected.expectedSeasonType &&
    game.seasonYear === expected.expectedSeason &&
    game.weekNumber === expected.expectedWeek
  );
}

export function isUnambiguousFinalNflGame(game: NflSlateGame): boolean {
  return (
    game.isCompleted &&
    !game.isPostponed &&
    game.status === "final"
  );
}

/**
 * Fail-closed validation for the ESPN slate used by automatic NFL advancement.
 * The scheduler must only move a pool after every returned event belongs to the
 * requested season/type/week and has an unambiguous final result.
 */
export function evaluateNflAutoAdvanceSlate(
  options: EvaluateNflAutoAdvanceSlateOptions,
): NflAutoAdvanceDecision {
  const {
    games,
    currentWeek,
    expectedSeason,
    expectedSeasonType,
    terminalWeek,
  } = options;

  if (currentWeek >= terminalWeek) {
    return { canAdvance: false, reason: "terminal-week" };
  }

  if (games.length === 0) {
    return { canAdvance: false, reason: "empty-slate" };
  }

  const matchesRequestedSlate = games.every((game) =>
    isNflGameFromRequestedSlate(game, {
      expectedSeason,
      expectedSeasonType,
      expectedWeek: currentWeek,
    }),
  );
  if (!matchesRequestedSlate) {
    return { canAdvance: false, reason: "mismatched-slate" };
  }

  const isFullyFinal = games.every(isUnambiguousFinalNflGame);
  if (!isFullyFinal) {
    return { canAdvance: false, reason: "unfinished-slate" };
  }

  return { canAdvance: true };
}