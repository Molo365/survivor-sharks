import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etWallClockToUtc } from "./nfl-slate-reveal";
import {
  getPlatformPicksOpenDateEtForWeekContaining,
  getTuesdaySixAmOpensAfterPeriodEnd,
  getTuesdaySixAmOpensForWeekContaining,
  isBeforePlatformPicksOpenForWeekContaining,
  isPlatformPromotionAllowedAfterPeriodEnd,
} from "./platform-period";

describe("platform period opens Tuesday 6 AM ET", () => {
  it("opens NBA weekend sheet on Tuesday 6 AM of the week that contains the Friday", () => {
    const friday = "2026-10-24";
    assert.equal(getPlatformPicksOpenDateEtForWeekContaining(friday), "2026-10-20");
    const open = getTuesdaySixAmOpensForWeekContaining(friday);
    assert.equal(open.getTime(), etWallClockToUtc("2026-10-20", 6, 0).getTime());
    assert.equal(
      isBeforePlatformPicksOpenForWeekContaining(friday, new Date("2026-10-20T05:59:00-04:00")),
      true,
    );
    assert.equal(
      isBeforePlatformPicksOpenForWeekContaining(friday, new Date("2026-10-20T06:00:00-04:00")),
      false,
    );
  });

  it("promotes after a Sunday period end on Tuesday 6 AM (Monday is results day)", () => {
    const sunday = "2026-10-25";
    const open = getTuesdaySixAmOpensAfterPeriodEnd(sunday);
    assert.equal(open.getTime(), etWallClockToUtc("2026-10-27", 6, 0).getTime());
    assert.equal(
      isPlatformPromotionAllowedAfterPeriodEnd(sunday, new Date("2026-10-26T20:00:00-04:00")),
      false,
    );
    assert.equal(
      isPlatformPromotionAllowedAfterPeriodEnd(sunday, new Date("2026-10-27T06:00:00-04:00")),
      true,
    );
  });
});
