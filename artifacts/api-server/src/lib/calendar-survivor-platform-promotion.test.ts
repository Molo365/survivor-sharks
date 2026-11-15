import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarSurvivorNextPeriodOpensAt } from "./calendar-survivor-period";
import { getTuesdaySixAmOpensAfterPeriodEnd } from "./platform-period";

describe("calendar survivor platform promotion", () => {
  it("NHL survivor promotes the Tuesday after Saturday slate ends", () => {
    const saturdayEt = "2026-11-14";
    const sundayMorning = new Date("2026-11-15T15:00:00.000Z"); // Nov 15 ~10 AM ET
    const opensAt = calendarSurvivorNextPeriodOpensAt(saturdayEt, sundayMorning);
    assert.ok(opensAt);
    assert.equal(
      new Date(opensAt).getTime(),
      getTuesdaySixAmOpensAfterPeriodEnd(saturdayEt).getTime(),
    );
  });

  it("returns null once Tuesday 6 AM ET has passed", () => {
    const saturdayEt = "2026-11-14";
    const tuesdayOpen = getTuesdaySixAmOpensAfterPeriodEnd(saturdayEt);
    assert.equal(
      calendarSurvivorNextPeriodOpensAt(saturdayEt, tuesdayOpen),
      null,
    );
  });
});