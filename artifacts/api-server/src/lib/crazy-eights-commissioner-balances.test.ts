import { describe, expect, it } from "vitest";
import {
  crazyEightsCommissionerPeriodKey,
  isCrazyEightsCommissionerBalancesPool,
} from "./crazy-eights-commissioner-balances";

describe("crazy-eights commissioner balances", () => {
  it("accepts paid recurring NBA Fast Break Multiplier pools", () => {
    expect(
      isCrazyEightsCommissionerBalancesPool({
        sport: "nba",
        poolType: "fast_break_multiplier",
        isRecurring: true,
        entryFee: 200,
      }),
    ).toBe(true);
  });

  it("accepts paid recurring NHL Hit the Ice pools", () => {
    expect(
      isCrazyEightsCommissionerBalancesPool({
        sport: "nhl",
        poolType: "crazy_8s",
        isRecurring: true,
        entryFee: 50,
      }),
    ).toBe(true);
  });

  it("rejects free or non-recurring pools", () => {
    expect(
      isCrazyEightsCommissionerBalancesPool({
        sport: "nba",
        poolType: "fast_break_multiplier",
        isRecurring: true,
        entryFee: 0,
      }),
    ).toBe(false);
    expect(
      isCrazyEightsCommissionerBalancesPool({
        sport: "nba",
        poolType: "fast_break_multiplier",
        isRecurring: false,
        entryFee: 200,
      }),
    ).toBe(false);
  });

  it("uses stable period keys per week number", () => {
    expect(crazyEightsCommissionerPeriodKey(1)).toBe("c8-week-1");
  });
});
