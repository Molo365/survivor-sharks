import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weeklyPickEmWeeklyEntryDollars } from "./weekly-pickem-commissioner-balance-math";

/** Mirrored from weekly-pickem-commissioner-balances (avoid DB bundle in this test). */
function weeklyPickEmRecurringSeasonPrizePeriodKey(userId: number): string {
  return `pickem-weekly-season-prize-u${userId}`;
}

describe("weekly pick-em commissioner balance helpers", () => {
  it("scales entry due by completed week count", () => {
    assert.equal(weeklyPickEmWeeklyEntryDollars(10, 3), 30);
    assert.equal(weeklyPickEmWeeklyEntryDollars(10, 0), 0);
    assert.equal(weeklyPickEmWeeklyEntryDollars(0, 5), 0);
  });

  it("uses stable recurring season prize period keys per winner", () => {
    assert.equal(weeklyPickEmRecurringSeasonPrizePeriodKey(7), "pickem-weekly-season-prize-u7");
  });

  it("partial collection leaves proportional remainder", () => {
    const entryFee = 20;
    const completedWeekCount = 4;
    const entryWeeksCollected = 2;
    const totalDue = weeklyPickEmWeeklyEntryDollars(entryFee, completedWeekCount);
    const remaining = weeklyPickEmWeeklyEntryDollars(
      entryFee,
      completedWeekCount - entryWeeksCollected,
    );
    assert.equal(totalDue, 80);
    assert.equal(remaining, 40);
    const weeklyWon = 15;
    const seasonPrizeWon = 0;
    const totalWon = weeklyWon + seasonPrizeWon;
    assert.equal(remaining - totalWon, 25);
  });
});
