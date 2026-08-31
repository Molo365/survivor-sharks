import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNflAutoAdvanceSlate,
  isNflGameFromRequestedSlate,
  isUnambiguousFinalNflGame,
  type NflAutoAdvanceBlockReason,
} from "./nfl-auto-advance";

type TestGame = Parameters<typeof evaluateNflAutoAdvanceSlate>[0]["games"][number];

function finalGame(overrides: Partial<TestGame> = {}): TestGame {
  return {
    seasonType: 2,
    seasonYear: 2026,
    weekNumber: 1,
    status: "final",
    isCompleted: true,
    isPostponed: false,
    ...overrides,
  };
}

function decisionFor(
  games: TestGame[],
  overrides: Partial<Parameters<typeof evaluateNflAutoAdvanceSlate>[0]> = {},
) {
  return evaluateNflAutoAdvanceSlate({
    games,
    currentWeek: 1,
    expectedSeason: 2026,
    expectedSeasonType: 2,
    terminalWeek: 18,
    ...overrides,
  });
}

function assertBlocked(
  games: TestGame[],
  reason: NflAutoAdvanceBlockReason,
  overrides: Partial<Parameters<typeof evaluateNflAutoAdvanceSlate>[0]> = {},
) {
  assert.deepEqual(decisionFor(games, overrides), { canAdvance: false, reason });
}

test("allows a fully final regular-season slate before Week 18", () => {
  assert.deepEqual(
    decisionFor([finalGame(), finalGame()]),
    { canAdvance: true },
  );
});

test("allows a fully final preseason slate before preseason Week 4", () => {
  assert.deepEqual(
    decisionFor(
      [
        finalGame({ seasonType: 1, weekNumber: 3 }),
        finalGame({ seasonType: 1, weekNumber: 3 }),
      ],
      {
        currentWeek: 3,
        expectedSeasonType: 1,
        terminalWeek: 4,
      },
    ),
    { canAdvance: true },
  );
});

test("keeps regular-season Week 18 terminal", () => {
  assertBlocked(
    [finalGame({ weekNumber: 18 })],
    "terminal-week",
    { currentWeek: 18 },
  );
});

test("keeps preseason Week 4 terminal", () => {
  assertBlocked(
    [finalGame({ seasonType: 1, weekNumber: 4 })],
    "terminal-week",
    { currentWeek: 4, expectedSeasonType: 1, terminalWeek: 4 },
  );
});

test("blocks an empty ESPN response", () => {
  assertBlocked([], "empty-slate");
});

test("blocks stale or mismatched season, season type, and week data", () => {
  for (const game of [
    finalGame({ seasonYear: 2025 }),
    finalGame({ seasonType: 1 }),
    finalGame({ weekNumber: 2 }),
    finalGame({ seasonYear: undefined }),
    finalGame({ weekNumber: undefined }),
  ]) {
    assertBlocked([game], "mismatched-slate");
  }
});

test("blocks scheduled, in-progress, postponed, and suspended games", () => {
  for (const game of [
    finalGame({ status: "scheduled", isCompleted: false }),
    finalGame({ status: "in_progress", isCompleted: false }),
    finalGame({ status: "postponed", isCompleted: false, isPostponed: true }),
    finalGame({ status: "suspended", isCompleted: false, isPostponed: true }),
  ]) {
    assertBlocked([game], "unfinished-slate");
  }
});

test("fails closed on contradictory ESPN completion flags", () => {
  assertBlocked(
    [finalGame({ status: "postponed", isCompleted: true, isPostponed: true })],
    "unfinished-slate",
  );
});

test("grading predicates reject wrong slates and ambiguous completion", () => {
  const expected = {
    expectedSeason: 2026,
    expectedSeasonType: 2 as const,
    expectedWeek: 1,
  };

  assert.equal(isNflGameFromRequestedSlate(finalGame(), expected), true);
  assert.equal(
    isNflGameFromRequestedSlate(finalGame({ seasonYear: 2025 }), expected),
    false,
  );
  assert.equal(isUnambiguousFinalNflGame(finalGame()), true);
  assert.equal(
    isUnambiguousFinalNflGame(
      finalGame({ status: "suspended", isCompleted: true, isPostponed: true }),
    ),
    false,
  );
});