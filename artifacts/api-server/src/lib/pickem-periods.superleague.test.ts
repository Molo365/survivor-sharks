import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCalendarSoccerPeriodBounds } from "./pickem-periods";

const pool = {
  sport: "superleague",
  poolType: "pickem",
  pickFrequency: "weekly",
  initialPeriodStart: null,
};

describe("resolveCalendarSoccerPeriodBounds", () => {
  it("normalizes any in-slate date to the canonical Fri–Mon window", () => {
    const now = new Date("2026-11-10T12:00:00-05:00");
    assert.deepEqual(resolveCalendarSoccerPeriodBounds("superleague", pool, "2026-11-07", now), {
      weekStart: "2026-11-06",
      weekEnd: "2026-11-09",
      viewingPastPeriod: true,
    });
    assert.deepEqual(resolveCalendarSoccerPeriodBounds("superleague", pool, "2026-11-06", now), {
      weekStart: "2026-11-06",
      weekEnd: "2026-11-09",
      viewingPastPeriod: true,
    });
  });
});
