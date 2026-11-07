import { describe, it } from "node:test";
import assert from "node:assert/strict";

function survivorSeasonPrizePeriodKey(userId: number) {
  return `survivor-season-prize-u${userId}`;
}

function isSurvivorSeasonCommissionerBalancesPool(pool: {
  poolType: string;
  entryFee: number | null;
}): boolean {
  const pt = pool.poolType as string;
  if (pt !== "season" && pt !== "mid_season") return false;
  if (pool.entryFee == null || pool.entryFee <= 0) return false;
  return true;
}

describe("survivor season commissioner balance helpers", () => {
  it("uses stable season prize period keys per winner", () => {
    assert.equal(survivorSeasonPrizePeriodKey(7), "survivor-season-prize-u7");
  });

  it("gates paid survivor season and mid_season pools", () => {
    assert.equal(
      isSurvivorSeasonCommissionerBalancesPool({ poolType: "season", entryFee: 25 }),
      true,
    );
    assert.equal(
      isSurvivorSeasonCommissionerBalancesPool({ poolType: "mid_season", entryFee: 10 }),
      true,
    );
    assert.equal(
      isSurvivorSeasonCommissionerBalancesPool({ poolType: "season", entryFee: 0 }),
      false,
    );
    assert.equal(
      isSurvivorSeasonCommissionerBalancesPool({ poolType: "pickem", entryFee: 10 }),
      false,
    );
    assert.equal(
      isSurvivorSeasonCommissionerBalancesPool({ poolType: "weekly", entryFee: 10 }),
      false,
    );
  });
});
