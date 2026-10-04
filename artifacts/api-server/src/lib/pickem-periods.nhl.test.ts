import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNhlPickEmWeekPeriodKey, resolveNhlPickEmPeriod } from "./pickem-periods";

describe("NHL pick-em period helpers", () => {
  const pool = {
    createdAt: new Date("2026-10-01T12:00:00Z"),
    currentWeek: 2,
    initialPeriodStart: null as string | null,
  };

  it("resolves period key from week number", () => {
    const key = getNhlPickEmWeekPeriodKey(pool, 1);
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
    const resolved = resolveNhlPickEmPeriod(pool, key);
    assert.ok(resolved);
    assert.equal(resolved!.weekNumber, 1);
    assert.equal(resolved!.viewingPastPeriod, true);
  });

  it("defaults to current week when periodStart omitted", () => {
    const resolved = resolveNhlPickEmPeriod(pool, undefined);
    assert.ok(resolved);
    assert.equal(resolved!.weekNumber, 2);
    assert.equal(resolved!.viewingPastPeriod, false);
  });
});
