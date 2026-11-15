import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarSurvivorNextPeriodOpensAt,
  isCalendarSurvivorSoloWinnerDeclarationAllowed,
  shouldReconcilePrematureCalendarSurvivorWeek,
} from "./calendar-survivor-period";
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

  it("reconciles when week N+1 opened early on Monday", () => {
    assert.equal(
      shouldReconcilePrematureCalendarSurvivorWeek({
        currentWeek: 5,
        previousWeekFinalized: true,
        currentWeekFinalized: false,
        currentWeekHasAnyPicks: false,
        promotionAllowedForPreviousPeriod: false,
      }),
      true,
    );
    assert.equal(
      shouldReconcilePrematureCalendarSurvivorWeek({
        currentWeek: 5,
        previousWeekFinalized: true,
        currentWeekFinalized: false,
        currentWeekHasAnyPicks: true,
        promotionAllowedForPreviousPeriod: false,
      }),
      false,
    );
  });

  it("allows solo winner crown on the day after the NHL Saturday slate", () => {
    const saturday = "2026-11-14";
    assert.equal(
      isCalendarSurvivorSoloWinnerDeclarationAllowed(saturday, new Date("2026-11-14T23:59:00-05:00")),
      false,
    );
    assert.equal(
      isCalendarSurvivorSoloWinnerDeclarationAllowed(saturday, new Date("2026-11-15T08:00:00-05:00")),
      true,
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