import { describe, expect, it } from "vitest";
import {
  inferWeeklyPickEmPayoutModelFromPool,
  isNhlSeasonBudgetWeeklyBonusEligible,
  isWeeklyPickEmPayoutModelChoiceEligible,
  prizeExamplePot,
} from "./weeklyPickEmPayoutModel";

describe("isWeeklyPickEmPayoutModelChoiceEligible", () => {
  it("allows recurring NHL weekly pickem", () => {
    expect(
      isWeeklyPickEmPayoutModelChoiceEligible({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
      }),
    ).toBe(true);
  });

  it("skips non-recurring pickem", () => {
    expect(
      isWeeklyPickEmPayoutModelChoiceEligible({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: false,
      }),
    ).toBe(false);
  });

  it("skips NFL pickem_season", () => {
    expect(
      isWeeklyPickEmPayoutModelChoiceEligible({
        sport: "nfl",
        poolType: "pickem_season",
        pickFrequency: "weekly",
        isRecurring: true,
      }),
    ).toBe(false);
  });
});

describe("isNhlSeasonBudgetWeeklyBonusEligible", () => {
  it("requires season_budget on NHL recurring pickem", () => {
    expect(
      isNhlSeasonBudgetWeeklyBonusEligible({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        payoutModel: "period_pot",
      }),
    ).toBe(false);
    expect(
      isNhlSeasonBudgetWeeklyBonusEligible({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        payoutModel: "season_budget",
      }),
    ).toBe(true);
  });
});

describe("inferWeeklyPickEmPayoutModelFromPool", () => {
  it("maps weeklyBonusEnabled to season_budget", () => {
    expect(
      inferWeeklyPickEmPayoutModelFromPool({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyBonusEnabled: true,
      }),
    ).toBe("season_budget");
    expect(
      inferWeeklyPickEmPayoutModelFromPool({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyBonusEnabled: false,
      }),
    ).toBe("period_pot");
  });

  it("prefers stored weeklyPickEmPayoutModel over weeklyBonusEnabled", () => {
    expect(
      inferWeeklyPickEmPayoutModelFromPool({
        sport: "nhl",
        poolType: "pickem",
        pickFrequency: "weekly",
        isRecurring: true,
        weeklyBonusEnabled: true,
        weeklyPickEmPayoutModel: "period_pot",
      }),
    ).toBe("period_pot");
  });
});

describe("prizeExamplePot", () => {
  it("uses full period pot for period_pot model", () => {
    const r = prizeExamplePot({
      entryFee: 100,
      playerCount: 4,
      payoutModel: "period_pot",
      weeklyBonusEnabled: false,
      weeklyBonusAmount: 0,
      weeklyBonusMinPlayers: 1,
    });
    expect(r.dollars).toBe(400);
    expect(r.label).toContain("week");
  });

  it("uses season leftover when season budget and threshold met", () => {
    const r = prizeExamplePot({
      entryFee: 100,
      playerCount: 4,
      payoutModel: "season_budget",
      weeklyBonusEnabled: true,
      weeklyBonusAmount: 20,
      weeklyBonusMinPlayers: 4,
    });
    // 400 collected - 18*20 reserve = 40
    expect(r.dollars).toBe(40);
    expect(r.label).toContain("Season-end");
  });
});
