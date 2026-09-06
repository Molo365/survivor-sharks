import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMlsConfiguredPeriod,
  getMlsWeeklyInitialPeriodStart,
  isMlsWeeklyPickem,
  isMlsWeeklyPreStart,
  resolveMlsWeeklyStartDate,
} from "./mls-weekly-period";
import { isMlbWeeklyHighHeat, isMlbWeeklyPickem } from "./mlb-weekly-period";

const futurePool = {
  sport: "mls",
  poolType: "pickem",
  pickFrequency: "weekly",
  initialPeriodStart: "2026-09-14",
};

describe("MLS weekly Pick-Em initial period", () => {
  it("accepts only this week or next week", () => {
    const sunday = new Date("2026-09-06T12:00:00-04:00");
    assert.equal(resolveMlsWeeklyStartDate(undefined, sunday), "2026-08-31");
    assert.equal(resolveMlsWeeklyStartDate("2026-09-07", sunday), "2026-09-07");
    assert.equal(resolveMlsWeeklyStartDate("2026-09-21", sunday), "2026-08-31");
  });

  it("withholds a next-week pool until its configured Monday", () => {
    assert.equal(isMlsWeeklyPreStart(futurePool, new Date("2026-09-13T23:59:59-04:00")), true);
    assert.deepEqual(
      getMlsConfiguredPeriod(futurePool, new Date("2026-09-13T12:00:00-04:00")),
      { weekStart: "2026-09-14", weekEnd: "2026-09-20" },
    );
  });

  it("opens automatically at midnight ET on the configured Monday", () => {
    const monday = new Date("2026-09-14T00:00:00-04:00");
    assert.equal(isMlsWeeklyPreStart(futurePool, monday), false);
    assert.deepEqual(getMlsConfiguredPeriod(futurePool, monday), {
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
    });
  });

  it("keeps legacy null-anchor MLS pools immediately active", () => {
    const legacy = { ...futurePool, initialPeriodStart: null };
    const now = new Date("2026-09-09T12:00:00-04:00");
    assert.equal(isMlsWeeklyPreStart(legacy, now), false);
    assert.equal(getMlsWeeklyInitialPeriodStart(legacy, now), "2026-09-07");
    assert.deepEqual(getMlsConfiguredPeriod(legacy, now), {
      weekStart: "2026-09-07",
      weekEnd: "2026-09-13",
    });
  });

  it("does not classify other MLS pool combinations", () => {
    assert.equal(isMlsWeeklyPickem({ ...futurePool, poolType: "season" }), false);
    assert.equal(isMlsWeeklyPickem({ ...futurePool, pickFrequency: "daily" }), false);
  });

  it("leaves MLB Pick-Em and High Heat classification unchanged", () => {
    const mlb = {
      ...futurePool,
      sport: "mlb",
      createdAt: new Date("2026-09-06T16:00:00Z"),
    };
    assert.equal(isMlbWeeklyPickem(mlb), true);
    assert.equal(isMlbWeeklyHighHeat({ ...mlb, poolType: "crazy_8s" }), true);
    assert.equal(isMlbWeeklyPickem(futurePool as typeof mlb), false);
    assert.equal(isMlbWeeklyHighHeat(futurePool as typeof mlb), false);
  });
});