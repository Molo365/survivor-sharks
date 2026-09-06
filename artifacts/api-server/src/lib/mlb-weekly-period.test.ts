import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMlbWeeklyAnchor,
  isMlbWeeklyPreStart,
  resolveMlbWeeklyStartDate,
} from "./mlb-weekly-period";

const basePool = {
  sport: "mlb",
  poolType: "pickem",
  pickFrequency: "weekly",
  initialPeriodStart: "2026-09-14",
  createdAt: new Date("2026-09-06T16:00:00Z"),
};

describe("MLB weekly Pick-Em initial period", () => {
  it("withholds the pool before the selected next week", () => {
    assert.equal(isMlbWeeklyPreStart(basePool, new Date("2026-09-13T23:59:59-04:00")), true);
  });

  it("opens automatically at midnight ET on the selected Monday", () => {
    assert.equal(isMlbWeeklyPreStart(basePool, new Date("2026-09-14T00:00:00-04:00")), false);
    assert.equal(getMlbWeeklyAnchor(basePool).toISOString(), "2026-09-14T12:00:00.000Z");
  });

  it("keeps this week as the default and accepts only this or next week", () => {
    const sunday = new Date("2026-09-06T12:00:00-04:00");
    assert.equal(resolveMlbWeeklyStartDate(undefined, sunday), "2026-08-31");
    assert.equal(resolveMlbWeeklyStartDate("2026-09-07", sunday), "2026-09-07");
    assert.equal(resolveMlbWeeklyStartDate("2026-09-21", sunday), "2026-08-31");
  });
});

describe("MLB weekly High Heat initial period", () => {
  const highHeatPool = { ...basePool, poolType: "crazy_8s" };

  it("uses the same pre-start gate as weekly Pick-Em", () => {
    assert.equal(isMlbWeeklyPreStart(highHeatPool, new Date("2026-09-13T23:59:59-04:00")), true);
    assert.equal(isMlbWeeklyPreStart(highHeatPool, new Date("2026-09-14T00:00:00-04:00")), false);
  });

  it("does not apply the gate to a daily High Heat pool", () => {
    assert.equal(isMlbWeeklyPreStart({ ...highHeatPool, pickFrequency: "daily" }, new Date("2026-09-13T12:00:00-04:00")), false);
  });
});