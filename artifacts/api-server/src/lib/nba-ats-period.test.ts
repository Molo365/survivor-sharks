import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNbaAtsPicksOpenDate,
  getNbaAtsSlateBoundsForPool,
  isNbaAtsPreStart,
  resolveNbaAtsStartDate,
} from "./nba-ats-period";

const basePool = {
  sport: "nba",
  poolType: "nba_ats",
  initialPeriodStart: "2026-10-24",
  createdAt: new Date("2026-10-16T16:00:00Z"),
  sandboxMode: false,
  currentWeek: 1,
};

describe("NBA ATS initial weekend", () => {
  it("withholds picks until Monday ET before the first weekend", () => {
    assert.equal(getNbaAtsPicksOpenDate(basePool), "2026-10-19");
    assert.equal(isNbaAtsPreStart(basePool, new Date("2026-10-18T23:59:59-04:00")), true);
    assert.equal(isNbaAtsPreStart(basePool, new Date("2026-10-19T00:00:00-04:00")), false);
  });

  it("does not pre-start when initialPeriodStart is unset (legacy pools)", () => {
    assert.equal(
      isNbaAtsPreStart({ ...basePool, initialPeriodStart: null }, new Date("2026-10-16T12:00:00-04:00")),
      false,
    );
  });

  it("anchors week 1 slate to initialPeriodStart instead of createdAt", () => {
    const bounds = getNbaAtsSlateBoundsForPool(basePool, 1);
    assert.deepEqual(bounds.days, ["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("accepts only this or next weekend Friday", () => {
    const thursday = new Date("2026-10-15T12:00:00-04:00");
    const thisFriday = resolveNbaAtsStartDate(undefined, thursday);
    const nextFriday = "2026-10-23";
    assert.equal(thisFriday, "2026-10-16");
    assert.equal(resolveNbaAtsStartDate(nextFriday, thursday), nextFriday);
    assert.equal(resolveNbaAtsStartDate("2026-11-01", thursday), thisFriday);
  });
});
