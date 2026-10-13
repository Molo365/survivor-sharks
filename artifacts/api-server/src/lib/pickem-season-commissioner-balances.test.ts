import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveWeeklyTiebreaker } from "./nfl-weekly-tiebreaker";

/** Mirror per-winner split used in pickem-season-commissioner-balances */
function perWinnerAmount(poolAmount: number, winners: number) {
  return Math.round((poolAmount / winners) * 100) / 100;
}

describe("pickem-season commissioner balance helpers", () => {
  it("splits weekly bonus evenly among tiebreaker winners", () => {
    const leaders = [{ userId: 1 }, { userId: 2 }];
    const resolution = resolveWeeklyTiebreaker(leaders, [
      { userId: 1, guess: 10, actual: 12 },
      { userId: 2, guess: 11, actual: 12 },
    ]);
    assert.equal(resolution.winners.length, 1);
    assert.equal(perWinnerAmount(10, resolution.winners.length), 10);
  });

  it("splits weekly bonus when multiple winners remain tied", () => {
    const amount = perWinnerAmount(10, 2);
    assert.equal(amount, 5);
  });
});
