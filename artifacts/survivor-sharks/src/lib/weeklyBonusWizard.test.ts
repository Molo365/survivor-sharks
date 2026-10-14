import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyBonusScenarios,
  deriveWeeklyBonusMinPlayers,
  resolveSeasonPrizePot,
  weeklyPayoutFromPercent,
} from "./weeklyBonusWizard.ts";

describe("weeklyBonusWizard", () => {
  it("rounds weekly payout to nearest $5", () => {
    assert.equal(weeklyPayoutFromPercent(100, 10), 10);
    assert.equal(weeklyPayoutFromPercent(50, 100), 50);
    assert.equal(weeklyPayoutFromPercent(57, 8.77), 5);
  });

  it("office-style 100% weekly on $50 entry needs 18 players at threshold", () => {
    const weekly = weeklyPayoutFromPercent(50, 100);
    assert.equal(weekly, 50);
    assert.equal(deriveWeeklyBonusMinPlayers(50, weekly), 18);
  });

  it("reduces season pot when weekly threshold is met", () => {
    const met = resolveSeasonPrizePot({
      entryFee: 100,
      memberCount: 5,
      weeklyBonusEnabled: true,
      weeklyBonusAmount: 10,
      weeklyThresholdMet: true,
    });
    assert.equal(met.collected, 500);
    assert.equal(met.weeklyReserveMax, 180);
    assert.equal(met.seasonPot, 320);

    const below = resolveSeasonPrizePot({
      entryFee: 100,
      memberCount: 4,
      weeklyBonusEnabled: true,
      weeklyBonusAmount: 10,
      weeklyThresholdMet: false,
    });
    assert.equal(below.seasonPot, 400);
  });

  it("builds below-threshold vs met scenarios", () => {
    const { minPlayers, scenarios } = buildWeeklyBonusScenarios({
      entryFee: 100,
      weeklyPercent: 10,
      examplePlayerCount: 57,
    });
    assert.equal(minPlayers, 2);
    assert.equal(scenarios[0].weeklyEnabled, false);
    assert.equal(scenarios[0].seasonPotGuidance, 100);
    assert.equal(scenarios[1].weeklyEnabled, true);
    assert.equal(scenarios[1].maxWeeklySeasonCost, 180);
    assert.equal(scenarios[2].playerCount, 57);
    assert.equal(scenarios[2].seasonPotGuidance, 57 * 100 - 180);
  });
});
