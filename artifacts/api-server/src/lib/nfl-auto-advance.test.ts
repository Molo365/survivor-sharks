import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateNflAutoAdvanceSlate,
  isCompleteNflSurvivorSlate,
  isNflGameFromRequestedSlate,
  isUnambiguousFinalNflGame,
  validateNflPreseasonPool,
  validateNflPreseasonSlate,
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

test("Survivor slate accepts exact postponed events", () => {
  const expected = {
    expectedSeason: 2026,
    expectedSeasonType: 2 as const,
    expectedWeek: 1,
  };
  assert.equal(isCompleteNflSurvivorSlate([
    finalGame(),
    finalGame({ status: "postponed", isCompleted: false, isPostponed: true }),
  ], expected), true);
});

test("Survivor slate rejects mismatched and unfinished non-postponed events", () => {
  const expected = {
    expectedSeason: 2026,
    expectedSeasonType: 2 as const,
    expectedWeek: 1,
  };
  assert.equal(isCompleteNflSurvivorSlate([
    finalGame({ weekNumber: 2 }),
  ], expected), false);
  assert.equal(isCompleteNflSurvivorSlate([
    finalGame({ status: "in_progress", isCompleted: false, isPostponed: false }),
  ], expected), false);
});

function preseasonGame(overrides: Partial<Parameters<typeof validateNflPreseasonSlate>[0][number]> = {}) {
  return {
    id: "game-1",
    seasonType: 1,
    seasonYear: 2026,
    weekNumber: 4,
    status: "final" as const,
    isCompleted: true,
    isPostponed: false,
    homeScore: 24,
    awayScore: 17,
    ...overrides,
  };
}

test("manual preseason validation accepts an exact fully final scored slate", () => {
  assert.deepEqual(
    validateNflPreseasonSlate(
      [preseasonGame(), preseasonGame({ id: "game-2" })],
      2026,
      4,
    ),
    { valid: true },
  );
});

test("manual preseason validation rejects duplicate, stale, unfinished, and unscored data", () => {
  assert.deepEqual(
    validateNflPreseasonSlate([preseasonGame(), preseasonGame()], 2026, 4),
    { valid: false, reason: "mismatched-slate" },
  );
  assert.deepEqual(
    validateNflPreseasonSlate([preseasonGame({ seasonYear: 2025 })], 2026, 4),
    { valid: false, reason: "mismatched-slate" },
  );
  assert.deepEqual(
    validateNflPreseasonSlate([preseasonGame({ status: "in_progress", isCompleted: false })], 2026, 4),
    { valid: false, reason: "unfinished-slate" },
  );
  assert.deepEqual(
    validateNflPreseasonSlate([preseasonGame({ homeScore: null })], 2026, 4),
    { valid: false, reason: "unfinished-slate" },
  );
});

const validPreseasonPool = {
  sport: "nfl" as const,
  poolType: "season" as const,
  isPreseason: true,
  sandboxMode: false,
  isActive: true,
  currentWeek: 4,
};

test("manual preseason pool guards reject unsafe pool states", () => {
  function reasonFor(pool: Parameters<typeof validateNflPreseasonPool>[0]) {
    const decision = validateNflPreseasonPool(pool);
    if (decision.valid) throw new Error("Expected pool guard to refuse this pool");
    return decision.reason;
  }

  assert.deepEqual(validateNflPreseasonPool(validPreseasonPool), { valid: true });
  assert.equal(reasonFor({ ...validPreseasonPool, sport: "mlb" as const }), "not-nfl");
  assert.equal(reasonFor({ ...validPreseasonPool, poolType: "pickem" as const }), "unsupported-pool-type");
  assert.equal(reasonFor({ ...validPreseasonPool, isPreseason: false }), "not-preseason");
  assert.equal(reasonFor({ ...validPreseasonPool, sandboxMode: true }), "sandbox");
  assert.equal(reasonFor({ ...validPreseasonPool, isActive: false }), "inactive");
  assert.equal(reasonFor({ ...validPreseasonPool, currentWeek: 5 }), "invalid-week");
});

test("manual preseason pool guards allow both season-long Pick-Em variants", () => {
  assert.deepEqual(
    validateNflPreseasonPool({ ...validPreseasonPool, poolType: "pickem_season" }),
    { valid: true },
  );
  assert.deepEqual(
    validateNflPreseasonPool({ ...validPreseasonPool, poolType: "nfl_confidence" }),
    { valid: true },
  );
});