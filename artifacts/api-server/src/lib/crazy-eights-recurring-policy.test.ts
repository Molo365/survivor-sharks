import assert from "node:assert/strict";
import test from "node:test";
import {
  isCrazyEightsPeriodAlreadyResolved,
  isRecurringNhlOrNbaCrazyEights,
  shouldRecordEmptyCrazyEightsPeriod,
} from "./crazy-eights-recurring-policy";

const basePool = {
  poolType: "crazy_8s",
  sport: "nhl",
  isRecurring: true,
  sandboxMode: false,
};

test("recurring scope includes only live recurring NHL and NBA Crazy 8s pools", () => {
  assert.equal(isRecurringNhlOrNbaCrazyEights(basePool), true);
  assert.equal(isRecurringNhlOrNbaCrazyEights({ ...basePool, sport: "nba" }), true);
  assert.equal(isRecurringNhlOrNbaCrazyEights({ ...basePool, sport: "mlb" }), false);
  assert.equal(isRecurringNhlOrNbaCrazyEights({ ...basePool, poolType: "pickem" }), false);
  assert.equal(isRecurringNhlOrNbaCrazyEights({ ...basePool, isRecurring: false }), false);
  assert.equal(isRecurringNhlOrNbaCrazyEights({ ...basePool, sandboxMode: true }), false);
});

test("empty recurring periods advance only after a complete available schedule", () => {
  assert.equal(shouldRecordEmptyCrazyEightsPeriod({
    inRecurringScope: true,
    totalPicks: 0,
    scheduleAvailable: true,
    hasUnfinishedGames: false,
  }), true);
  assert.equal(shouldRecordEmptyCrazyEightsPeriod({
    inRecurringScope: false,
    totalPicks: 0,
    scheduleAvailable: true,
    hasUnfinishedGames: false,
  }), false);
  assert.equal(shouldRecordEmptyCrazyEightsPeriod({
    inRecurringScope: true,
    totalPicks: 0,
    scheduleAvailable: false,
    hasUnfinishedGames: false,
  }), false);
  assert.equal(shouldRecordEmptyCrazyEightsPeriod({
    inRecurringScope: true,
    totalPicks: 0,
    scheduleAvailable: true,
    hasUnfinishedGames: true,
  }), false);
  assert.equal(shouldRecordEmptyCrazyEightsPeriod({
    inRecurringScope: true,
    totalPicks: 1,
    scheduleAvailable: true,
    hasUnfinishedGames: false,
  }), false);
});

test("recurring idempotency uses period results while legacy pools use final winners", () => {
  assert.equal(isCrazyEightsPeriodAlreadyResolved({
    inRecurringScope: true,
    hasPeriodResult: true,
    hasLegacyWinner: false,
  }), true);
  assert.equal(isCrazyEightsPeriodAlreadyResolved({
    inRecurringScope: true,
    hasPeriodResult: false,
    hasLegacyWinner: true,
  }), false);
  assert.equal(isCrazyEightsPeriodAlreadyResolved({
    inRecurringScope: false,
    hasPeriodResult: false,
    hasLegacyWinner: true,
  }), true);
});
