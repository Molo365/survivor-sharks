import { describe, it } from "node:test";
import assert from "node:assert/strict";

function nflConfidenceWeeklyBonusPeriodKey(week: number): string {
  return `nfl-confidence-w${week}`;
}

function nflConfidenceSeasonPrizePeriodKey(userId: number): string {
  return `nfl-confidence-season-prize-u${userId}`;
}

function isNflConfidenceCommissionerBalancesPool(pool: {
  poolType: string;
  entryFee: number | null;
}): boolean {
  if (pool.poolType !== "nfl_confidence") return false;
  return pool.entryFee != null && pool.entryFee > 0;
}

describe("nfl-confidence commissioner balances", () => {
  it("accepts paid nfl_confidence pools", () => {
    assert.equal(
      isNflConfidenceCommissionerBalancesPool({ poolType: "nfl_confidence", entryFee: 50 }),
      true,
    );
    assert.equal(
      isNflConfidenceCommissionerBalancesPool({ poolType: "nfl_confidence_weekly", entryFee: 50 }),
      false,
    );
    assert.equal(
      isNflConfidenceCommissionerBalancesPool({ poolType: "nfl_confidence", entryFee: 0 }),
      false,
    );
  });

  it("uses stable period keys", () => {
    assert.equal(nflConfidenceWeeklyBonusPeriodKey(12), "nfl-confidence-w12");
    assert.equal(nflConfidenceSeasonPrizePeriodKey(99), "nfl-confidence-season-prize-u99");
  });
});
