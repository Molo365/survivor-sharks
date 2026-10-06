import assert from "node:assert/strict";
import test from "node:test";
import { nbaAtsWeeklyPeriodReason, rankNbaAtsUsersByWeeklyScore } from "./nba-ats-weekly-groups";

test("rankNbaAtsUsersByWeeklyScore orders by correct count then margin", () => {
  const scoreByUser = new Map([
    [1, 5],
    [2, 5],
    [3, 4],
  ]);
  const marginByUser = new Map([
    [1, 12],
    [2, 8],
  ]);
  assert.deepEqual(rankNbaAtsUsersByWeeklyScore(scoreByUser, marginByUser), [[1], [2], [3]]);
});

test("rankNbaAtsUsersByWeeklyScore treats equal margins as co-winners", () => {
  const scoreByUser = new Map([
    [10, 3],
    [11, 3],
  ]);
  const marginByUser = new Map([
    [10, 5],
    [11, 5],
  ]);
  assert.deepEqual(rankNbaAtsUsersByWeeklyScore(scoreByUser, marginByUser), [[10, 11]]);
});

test("nbaAtsWeeklyPeriodReason", () => {
  assert.equal(nbaAtsWeeklyPeriodReason([]), "no picks");
  assert.equal(nbaAtsWeeklyPeriodReason([[1]]), "outright winner");
  assert.equal(nbaAtsWeeklyPeriodReason([[1, 2]]), "co-winners");
});
