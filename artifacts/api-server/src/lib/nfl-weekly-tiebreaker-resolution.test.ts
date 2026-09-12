import assert from "node:assert/strict";
import test from "node:test";
import {
  combineNflTiebreakerYards,
  parseNflWeeklyTiebreakerActual,
  resolveWeeklyTiebreaker,
} from "./nfl-weekly-tiebreaker";
import { resolveSequentialTiebreaker } from "./tiebreaker";

const leaders = [
  { userId: 1, name: "Ada" },
  { userId: 2, name: "Grace" },
  { userId: 3, name: "Linus" },
];

test("combines passing and rushing yards into the weekly actual", () => {
  assert.equal(
    combineNflTiebreakerYards({
      actualPassingYards: 510,
      actualRushingYards: 225,
    }),
    735,
  );
});

test("requires complete passing and rushing stats for both teams", () => {
  assert.equal(
    parseNflWeeklyTiebreakerActual([
      {
        statistics: [
          { name: "passingYards", displayValue: "250" },
          { name: "netPassingYards", displayValue: "240" },
          { name: "rushingYards", displayValue: "110" },
        ],
      },
      {
        statistics: [
          { name: "netPassingYards", displayValue: "280" },
          { name: "rushingYards", displayValue: "95" },
        ],
      },
    ]),
    725,
  );

  assert.equal(
    parseNflWeeklyTiebreakerActual([
      {
        statistics: [
          { name: "netPassingYards", displayValue: "240" },
          { name: "rushingYards", displayValue: "110" },
        ],
      },
      {
        statistics: [{ name: "netPassingYards", displayValue: "280" }],
      },
    ]),
    null,
  );
});

test("does not apply a tiebreaker to a sole score leader", () => {
  assert.deepEqual(resolveWeeklyTiebreaker([leaders[0]], []), {
    status: "not_needed",
    actual: null,
    winners: [leaders[0]],
  });
});

test("keeps tied score leaders pending until every guess has an actual", () => {
  assert.deepEqual(
    resolveWeeklyTiebreaker(leaders.slice(0, 2), [
      { userId: 1, guess: 700, actual: null },
      { userId: 2, guess: 720, actual: null },
    ]),
    {
      status: "pending",
      actual: null,
      winners: leaders.slice(0, 2),
    },
  );
});

test("selects the tied score leader closest to the weekly actual", () => {
  const result = resolveWeeklyTiebreaker(leaders, [
    { userId: 1, guess: 700, actual: 735 },
    { userId: 2, guess: 730, actual: 735 },
    { userId: 3, guess: 760, actual: 735 },
  ]);
  assert.equal(result.status, "resolved");
  assert.equal(result.actual, 735);
  assert.deepEqual(result.winners, [leaders[1]]);
});

test("preserves co-winners when guesses are equally close", () => {
  const result = resolveWeeklyTiebreaker(leaders.slice(0, 2), [
    { userId: 1, guess: 730, actual: 735 },
    { userId: 2, guess: 740, actual: 735 },
  ]);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.winners, leaders.slice(0, 2));
});

test("existing Week 18 season tiebreaker remains sequential passing then rushing", () => {
  const passingGuesses = new Map<number, number | null>([
    [1, 500],
    [2, 520],
    [3, 540],
  ]);
  const rushingGuesses = new Map<number, number | null>([
    [1, 190],
    [2, 205],
    [3, 220],
  ]);

  assert.deepEqual(
    resolveSequentialTiebreaker([1, 2, 3], passingGuesses, rushingGuesses, 522, 999),
    new Set([2]),
  );

  const tiedPassing = new Map<number, number | null>([
    [1, 500],
    [2, 540],
  ]);
  assert.deepEqual(
    resolveSequentialTiebreaker([1, 2], tiedPassing, rushingGuesses, 520, 207),
    new Set([2]),
  );

  assert.equal(
    resolveSequentialTiebreaker(
      [1, 2],
      tiedPassing,
      new Map([[1, 200], [2, 214]]),
      520,
      207,
    ),
    null,
  );
});