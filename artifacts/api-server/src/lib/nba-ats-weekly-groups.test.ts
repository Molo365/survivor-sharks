import assert from "node:assert/strict";
import test from "node:test";
import { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-ranking";

test("rankNbaAtsUsersByWeeklyScore orders by correct count then closest points guess", () => {
  const scoreByUser = new Map([
    [1, 5],
    [2, 5],
    [3, 4],
  ]);
  const diffByUser = new Map([
    [1, 2],
    [2, 8],
  ]);
  assert.deepEqual(rankNbaAtsUsersByWeeklyScore(scoreByUser, diffByUser), [[1], [2], [3]]);
});

test("rankNbaAtsUsersByWeeklyScore treats equal diffs as co-winners", () => {
  const scoreByUser = new Map([
    [10, 3],
    [11, 3],
  ]);
  const diffByUser = new Map([
    [10, 4],
    [11, 4],
  ]);
  assert.deepEqual(rankNbaAtsUsersByWeeklyScore(scoreByUser, diffByUser), [[10, 11]]);
});

test("nbaAtsWeeklyPeriodReason", () => {
  assert.equal(nbaAtsWeeklyPeriodReason([]), "no picks");
  assert.equal(nbaAtsWeeklyPeriodReason([[1]]), "outright winner");
  assert.equal(nbaAtsWeeklyPeriodReason([[1, 2]]), "co-winners");
});
