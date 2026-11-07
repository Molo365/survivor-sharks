import { describe, expect, it } from "vitest";
import {
  nbaAtsBillableEntryPeriods,
  nbaAtsCommissionerPeriodKey,
  nbaAtsOneShotPrizePeriodKey,
  isNbaAtsCommissionerBalancesPool,
} from "./nba-ats-commissioner-balances";
import { resolveEntryWeeksCollected } from "./weekly-pickem-commissioner-ledger";

describe("nba ats commissioner balances", () => {
  it("accepts paid recurring and one-shot NBA ATS pools", () => {
    expect(
      isNbaAtsCommissionerBalancesPool({
        poolType: "nba_ats",
        isRecurring: true,
        entryFee: 25,
      }),
    ).toBe(true);
    expect(
      isNbaAtsCommissionerBalancesPool({
        poolType: "nba_ats",
        isRecurring: false,
        entryFee: 50,
      }),
    ).toBe(true);
  });

  it("rejects free or non-nba_ats pools", () => {
    expect(
      isNbaAtsCommissionerBalancesPool({
        poolType: "pickem",
        isRecurring: true,
        entryFee: 25,
      }),
    ).toBe(false);
    expect(
      isNbaAtsCommissionerBalancesPool({
        poolType: "nba_ats",
        isRecurring: true,
        entryFee: 0,
      }),
    ).toBe(false);
  });

  it("uses stable period keys", () => {
    expect(nbaAtsCommissionerPeriodKey(3)).toBe("nba-ats-week-3");
    expect(nbaAtsOneShotPrizePeriodKey(42)).toBe("nba-ats-prize-u42");
  });

  it("billable weekends follow currentWeek minus one for recurring pools", () => {
    expect(
      nbaAtsBillableEntryPeriods({
        poolType: "nba_ats",
        isRecurring: true,
        entryFee: 20,
        currentWeek: 1,
      }),
    ).toBe(0);
    expect(
      nbaAtsBillableEntryPeriods({
        poolType: "nba_ats",
        isRecurring: true,
        entryFee: 20,
        currentWeek: 4,
      }),
    ).toBe(3);
    expect(
      nbaAtsBillableEntryPeriods({
        poolType: "nba_ats",
        isRecurring: false,
        entryFee: 20,
        currentWeek: 99,
      }),
    ).toBe(1);
  });

  it("resolves legacy full-paid vs partial weekends", () => {
    const flags = {
      entryPaidUserIds: new Set([1, 2]),
      periodPaidKeys: new Set<string>(),
      entryWeeksCollectedByUser: new Map([[2, 1]]),
      entryLegacyFullPaidUserIds: new Set([1]),
    };
    expect(resolveEntryWeeksCollected(1, 3, flags)).toBe(3);
    expect(resolveEntryWeeksCollected(2, 3, flags)).toBe(1);
    expect(resolveEntryWeeksCollected(99, 3, flags)).toBe(0);
  });
});
