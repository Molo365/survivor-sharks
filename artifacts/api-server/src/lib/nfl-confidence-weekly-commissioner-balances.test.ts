import { describe, expect, it } from "vitest";
import {
  isNflConfidenceWeeklyCommissionerBalancesPool,
  nflConfidenceWeeklyCompletedWeekCount,
  nflConfidenceWeeklyEntryBillablePeriods,
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

  it("accepts paid non-recurring nfl_confidence_weekly pools", () => {
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: false,
        entryFee: 50,
      }),
    ).toBe(true);
  });

  it("rejects free pools", () => {
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: true,
        entryFee: 0,
      }),
    ).toBe(false);
  });

  it("rejects wrong type or unknown recurring flag", () => {
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence",
        isRecurring: true,
        entryFee: 50,
      }),
    ).toBe(false);
    expect(
      isNflConfidenceWeeklyCommissionerBalancesPool({
        poolType: "nfl_confidence_weekly",
        isRecurring: undefined,
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

  it("bills one entry period for non-recurring; reload count for recurring", () => {
    expect(
      nflConfidenceWeeklyEntryBillablePeriods({
        poolType: "nfl_confidence_weekly",
        isRecurring: false,
        entryFee: 10,
        currentWeek: 8,
      }),
    ).toBe(1);
    expect(
      nflConfidenceWeeklyEntryBillablePeriods({
        poolType: "nfl_confidence_weekly",
        isRecurring: true,
        entryFee: 10,
        startWeek: 1,
        currentWeek: 5,
      }),
    ).toBe(4);
  });
});
