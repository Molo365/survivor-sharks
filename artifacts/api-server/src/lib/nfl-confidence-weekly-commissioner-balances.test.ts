import { describe, expect, it } from "vitest";
import {
  isNflConfidenceWeeklyCommissionerBalancesPool,
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
});
