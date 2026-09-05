import type { EspnGame } from "./espn";

export type NflAutoAdvanceBlockReason =
  | "terminal-week"
  | "empty-slate"
  | "mismatched-slate"
  | "unfinished-slate";

export type NflAutoAdvanceDecision =
  | { canAdvance: true }
  | { canAdvance: false; reason: NflAutoAdvanceBlockReason };

export type NflPreseasonSlateDecision =
  | { valid: true }
  | { valid: false; reason: "empty-slate" | "mismatched-slate" | "unfinished-slate" };

export type NflPreseasonPoolDecision =
  | { valid: true }
  | {
      valid: false;
      reason: "not-nfl" | "unsupported-pool-type" | "not-preseason" | "sandbox" | "inactive" | "invalid-week";
    };

type NflPreseasonValidationGame = Pick<
  EspnGame,
  "seasonType" | "seasonYear" | "weekNumber" | "status" | "isCompleted" | "isPostponed" | "homeScore" | "awayScore"
> & { id: string };

export function validateNflPreseasonPool(pool: {
  sport: string;
  poolType: string;
  isPreseason: boolean;
  sandboxMode: boolean;
  isActive: boolean;
  currentWeek: number;
}): NflPreseasonPoolDecision {
  if (pool.sport !== "nfl") return { valid: false, reason: "not-nfl" };
  if (!["season", "pickem_season", "nfl_confidence"].includes(pool.poolType)) {
    return { valid: false, reason: "unsupported-pool-type" };
  }
  if (!pool.isPreseason) return { valid: false, reason: "not-preseason" };
  if (pool.sandboxMode) return { valid: false, reason: "sandbox" };
  if (!pool.isActive) return { valid: false, reason: "inactive" };
  if (!Number.isInteger(pool.currentWeek) || pool.currentWeek < 1 || pool.currentWeek > 4) {
    return { valid: false, reason: "invalid-week" };
  }
  return { valid: true };
}

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
 * Survivor-only slate completion permits postponed events because selected
 * postponed teams are graded as pushes. Other NFL products retain the stricter
 * all-unambiguous-finals predicate.
 */
export function isCompleteNflSurvivorSlate(
  games: NflSlateGame[],
  expected: ExpectedNflSlate,
): boolean {
  return games.length > 0 && games.every(game =>
    isNflGameFromRequestedSlate(game, expected) &&
    (isUnambiguousFinalNflGame(game) || game.isPostponed)
  );
}

/**
 * Fail-closed validation for the manually settled NFL preseason week.
 * Unlike auto-advance, this intentionally permits the current week to be the
 * terminal week because the caller is explicitly closing the pool.
 */
export function validateNflPreseasonSlate(
  games: NflPreseasonValidationGame[],
  expectedSeason: number,
  expectedWeek: number,
): NflPreseasonSlateDecision {
  if (games.length === 0) return { valid: false, reason: "empty-slate" };

  const hasDuplicateEventIds = new Set(games.map((game) => game.id)).size !== games.length;
  const matchesRequestedSlate = !hasDuplicateEventIds && games.every((game) =>
    isNflGameFromRequestedSlate(game, {
      expectedSeason,
      expectedSeasonType: 1,
      expectedWeek,
    }),
  );
  if (!matchesRequestedSlate) return { valid: false, reason: "mismatched-slate" };

  const isFullyFinal = games.every((game) =>
    isUnambiguousFinalNflGame(game) &&
    Number.isFinite(game.homeScore) &&
    Number.isFinite(game.awayScore),
  );
  if (!isFullyFinal) return { valid: false, reason: "unfinished-slate" };

  return { valid: true };
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