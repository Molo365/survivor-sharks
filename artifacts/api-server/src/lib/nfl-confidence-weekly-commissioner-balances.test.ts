import { describe, expect, it } from "vitest";
import {
  isNflConfidenceWeeklyCommissionerBalancesPool,
  nflConfidenceWeeklyCompletedWeekCount,
  nflConfidenceWeeklyPeriodKey,
} from "./nfl-confidence-weekly-commissioner-balances";

describe("nfl-confidence-weekly commissioner balances", () => {
  it("accepts paid recurring nfl_confidence_weekly pools", () => {
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: true,
        entryFee: 100,
      }),
    ).toBe(true);
  });

  it("rejects free or non-recurring pools", () => {
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: true,
        entryFee: 0,
      }),
    ).toBe(false);
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: false,
        entryFee: 50,
      }),
    ).toBe(false);
  });

  it("uses stable period keys per NFL week", () => {
    expect(nflConfidenceWeeklyPeriodKey(8)).toBe("nfl-cw-week-8");
  });

  it("counts completed NFL weeks from startWeek through currentWeek − 1", () => {
    expect(nflConfidenceWeeklyCompletedWeekCount({ startWeek: 1, currentWeek: 1 })).toBe(0);
    expect(nflConfidenceWeeklyCompletedWeekCount({ startWeek: 1, currentWeek: 5 })).toBe(4);
    expect(nflConfidenceWeeklyCompletedWeekCount({ startWeek: 3, currentWeek: 7 })).toBe(4);
    expect(nflConfidenceWeeklyCompletedWeekCount({ currentWeek: 4 })).toBe(3);
  });
});
