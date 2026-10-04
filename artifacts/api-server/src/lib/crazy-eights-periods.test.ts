import test from "node:test";
import assert from "node:assert/strict";
import { getNhlWeekBounds } from "./espn";
import { resolveCrazyEightsPeriod } from "./crazy-eights-periods";

const pool = {
  sport: "nhl",
  poolType: "crazy_8s",
  isRecurring: true,
  sandboxMode: false,
  createdAt: new Date("2025-10-01T12:00:00Z"),
  currentWeek: 3,
  initialPeriodStart: null,
};

test("resolveCrazyEightsPeriod marks earlier weeks as past", () => {
  const current = resolveCrazyEightsPeriod(pool, undefined);
  assert.equal(current?.weekNumber, 3);
  assert.equal(current?.viewingPastPeriod, false);

  const week1Key = getNhlWeekBounds(pool.createdAt, 1, pool.initialPeriodStart).days[0]!;
  const week1 = resolveCrazyEightsPeriod(pool, week1Key);
  assert.equal(week1?.weekNumber, 1);
  assert.equal(week1?.viewingPastPeriod, true);
});
