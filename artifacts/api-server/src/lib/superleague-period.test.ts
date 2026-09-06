import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSuperLeagueConfiguredPeriod,
  isSuperLeaguePreStart,
  resolveSuperLeagueStartDate,
} from "./superleague-period";

const cases = [
  ["Monday", "2026-09-07T12:00:00-04:00", "2026-09-04", "2026-09-11"],
  ["Tuesday", "2026-09-08T12:00:00-04:00", "2026-09-11", "2026-09-18"],
  ["Wednesday", "2026-09-09T12:00:00-04:00", "2026-09-11", "2026-09-18"],
  ["Thursday", "2026-09-10T12:00:00-04:00", "2026-09-11", "2026-09-18"],
  ["Friday", "2026-09-11T12:00:00-04:00", "2026-09-11", "2026-09-18"],
] as const;

describe("Super League start-period resolution", () => {
  for (const [day, date, current, next] of cases) {
    it(`resolves this and next period correctly on ${day}`, () => {
      const now = new Date(date);
      assert.equal(resolveSuperLeagueStartDate(undefined, now), current);
      assert.equal(resolveSuperLeagueStartDate(next, now), next);
    });
  }

  it("gates a configured future pool and opens it on Friday", () => {
    const pool = { sport: "superleague", poolType: "pickem", pickFrequency: "weekly", initialPeriodStart: "2026-09-18" };
    assert.equal(isSuperLeaguePreStart(pool, new Date("2026-09-17T23:59:59-04:00")), true);
    assert.equal(isSuperLeaguePreStart(pool, new Date("2026-09-18T00:00:00-04:00")), false);
    assert.deepEqual(getSuperLeagueConfiguredPeriod(pool, new Date("2026-09-17T12:00:00-04:00")), {
      weekStart: "2026-09-18",
      weekEnd: "2026-09-21",
    });
  });

  it("leaves legacy null-anchor pools immediately active", () => {
    const pool = { sport: "superleague", poolType: "pickem", pickFrequency: "weekly", initialPeriodStart: null };
    const now = new Date("2026-09-09T12:00:00-04:00");
    assert.equal(isSuperLeaguePreStart(pool, now), false);
    assert.deepEqual(getSuperLeagueConfiguredPeriod(pool, now), {
      weekStart: "2026-09-11",
      weekEnd: "2026-09-14",
    });
  });
});