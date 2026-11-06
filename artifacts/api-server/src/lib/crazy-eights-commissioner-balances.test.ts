import { describe, expect, it } from "vitest";
import {
  crazyEightsCommissionerPeriodKey,
  crazyEightsCompletedWeekCount,
  crazyEightsWeeklyEntryTotal,
  isCrazyEightsCommissionerBalancesPool,
} from "./crazy-eights-commissioner-balances";
import { resolveEntryWeeksCollected } from "./weekly-pickem-commissioner-ledger";

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

  it("scales entry totals by completed week count", () => {
    expect(crazyEightsCompletedWeekCount(5)).toBe(4);
    expect(crazyEightsWeeklyEntryTotal(100, 4)).toBe(400);
    expect(crazyEightsWeeklyEntryTotal(100, 0)).toBe(0);
  });

  it("resolves legacy full-paid vs partial weeks", () => {
    const flags = {
      entryPaidUserIds: new Set([1, 2]),
      periodPaidKeys: new Set<string>(),
      entryWeeksCollectedByUser: new Map([[2, 2]]),
      entryLegacyFullPaidUserIds: new Set([1]),
    };
    expect(resolveEntryWeeksCollected(1, 4, flags)).toBe(4);
    expect(resolveEntryWeeksCollected(2, 4, flags)).toBe(2);
    expect(resolveEntryWeeksCollected(99, 4, flags)).toBe(0);
  });
});
