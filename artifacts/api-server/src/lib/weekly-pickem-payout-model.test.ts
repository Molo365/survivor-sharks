import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isWeeklyPickEmPayoutModelPool,
  resolveWeeklyPickEmPayoutModel,
  shouldUsePeriodPotWeeklyPrizes,
  shouldUseSeasonBudgetFixedWeeklyPayout,
} from "./weekly-pickem-payout-model";

describe("weekly-pickem-payout-model", () => {
  it("detects recurring weekly pickem sports", () => {
    assert.equal(
      isWeeklyPickEmPayoutModelPool({
        sport: "mlb",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
      }),
      true,
    );
    assert.equal(
      isWeeklyPickEmPayoutModelPool({
        sport: "nba",
        poolType: "nba_ats",
        pickFrequency: "weekly",
        isRecurring: true,
      }),
      false,
    );
  });

  it("infers legacy season_budget from weekly bonus", () => {
    assert.equal(
      resolveWeeklyPickEmPayoutModel({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyBonusEnabled: true,
      }),
      "season_budget",
    );
    assert.equal(
      resolveWeeklyPickEmPayoutModel({
        sport: "mlb",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyPickEmPayoutModel: "period_pot",
        weeklyBonusEnabled: false,
      }),
      "period_pot",
    );
  });

  it("routes weekly prize math by model", () => {
    const nhlSeason = {
      sport: "nhl",
      poolType: "pickem",
      pickFrequency: "weekly",
      isRecurring: true,
      weeklyPickEmPayoutModel: "season_budget",
      weeklyBonusEnabled: true,
    } as const;
    assert.equal(shouldUsePeriodPotWeeklyPrizes(nhlSeason), false);
    assert.equal(shouldUseSeasonBudgetFixedWeeklyPayout(nhlSeason), true);

    const mlbPeriod = {
      sport: "mlb",
      poolType: "pickem",
      pickFrequency: "weekly",
      isRecurring: true,
      weeklyPickEmPayoutModel: "period_pot",
    } as const;
    assert.equal(shouldUsePeriodPotWeeklyPrizes(mlbPeriod), true);
    assert.equal(shouldUseSeasonBudgetFixedWeeklyPayout(mlbPeriod), false);
  });
});
