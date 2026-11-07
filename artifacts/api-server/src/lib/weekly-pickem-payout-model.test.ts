import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPickemWeeklyCommissionerBalancesPool,
  isWeeklyPickEmCommissionerBalancesPool,
  isWeeklyPickEmOneShotCommissionerBalancesPool,
  isWeeklyPickEmPayoutModelPool,
  resolveWeeklyPickEmPayoutModel,
  shouldUsePeriodPotWeeklyPrizes,
  shouldUseSeasonBudgetFixedWeeklyPayout,
  weeklyPickEmOneShotContestPeriodKey,
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

  it("accepts paid one-shot weekly pick-em contests", () => {
    assert.equal(
      isWeeklyPickEmOneShotCommissionerBalancesPool({
        sport: "nfl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: false,
        entryFee: 20,
      }),
      true,
    );
    assert.equal(
      isWeeklyPickEmOneShotCommissionerBalancesPool({
        sport: "mlb",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: false,
        entryFee: 10,
      }),
      true,
    );
    assert.equal(
      isWeeklyPickEmOneShotCommissionerBalancesPool({
        sport: "nfl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 20,
      }),
      false,
    );
    assert.equal(
      isPickemWeeklyCommissionerBalancesPool({
        sport: "nfl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: false,
        entryFee: 25,
      }),
      true,
    );
    assert.equal(weeklyPickEmOneShotContestPeriodKey(1), "pickem-contest-w1");
  });

  it("includes Champions League in recurring weekly pick-em payout model", () => {
    assert.equal(
      isWeeklyPickEmPayoutModelPool({
        sport: "championsleague",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
      }),
      true,
    );
    assert.equal(
      resolveWeeklyPickEmPayoutModel({
        sport: "championsleague",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyBonusEnabled: false,
      }),
      "season_budget",
    );
    assert.equal(
      isWeeklyPickEmCommissionerBalancesPool({
        sport: "championsleague",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 25,
      }),
      true,
    );
  });

  it("commissioner balances require paid recurring weekly pickem", () => {
    assert.equal(
      isWeeklyPickEmCommissionerBalancesPool({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 10,
      }),
      true,
    );
    assert.equal(
      isWeeklyPickEmCommissionerBalancesPool({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 0,
      }),
      false,
    );
    assert.equal(
      isWeeklyPickEmCommissionerBalancesPool({
        sport: "nba",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 10,
      }),
      true,
    );
    assert.equal(
      isWeeklyPickEmCommissionerBalancesPool({
        sport: "nfl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        entryFee: 10,
      }),
      false,
    );
  });
});
