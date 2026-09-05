import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSurvivorOutcomes,
  buildTerminalSurvivorClosurePlan,
  classifyFollowingRegularSeasonSlate,
  decideSurvivorWipeout,
  isFinalCalendarSurvivorPeriod,
  isCompleteRegularSeasonSlate,
  resolveSuperLeagueSettlementBounds,
  shouldAdvanceLiveSurvivorPeriod,
  survivorStateEffect,
} from "./survivor-week-settlement";
import { calcPrize } from "./prizeCalc";

for (const sport of ["nfl", "nhl", "nba", "superleague"] as const) {
  test(`${sport}: nonterminal wipeout voids`, () => {
    assert.equal(decideSurvivorWipeout({
      sport, week: sport === "superleague" ? 37 : 10, allAliveAtStartLost: true,
      followingRegularSeasonSlate: sport === "nhl" || sport === "nba" ? "confirmed" : undefined,
    }), "void");
  });
}
test("mixed results, confirmed terminals, and unknown terminals resolve safely", () => {
  assert.equal(decideSurvivorWipeout({ sport: "nfl", week: 10, allAliveAtStartLost: false }), "normal");
  assert.equal(decideSurvivorWipeout({ sport: "nfl", week: 18, allAliveAtStartLost: true }), "co-winners");
  assert.equal(decideSurvivorWipeout({ sport: "superleague", week: 38, allAliveAtStartLost: true }), "co-winners");
  assert.equal(decideSurvivorWipeout({ sport: "nfl", week: 19, allAliveAtStartLost: true }), "manual-review");
  assert.equal(decideSurvivorWipeout({ sport: "superleague", week: 39, allAliveAtStartLost: true }), "manual-review");
  assert.equal(decideSurvivorWipeout({ sport: "nba", week: 10, allAliveAtStartLost: true }), "manual-review");
  assert.equal(decideSurvivorWipeout({
    sport: "nba", week: 10, allAliveAtStartLost: true,
    followingRegularSeasonSlate: "unknown", terminalPeriodConfirmed: true,
  }), "co-winners");
  assert.equal(decideSurvivorWipeout({
    sport: "nhl", week: 10, allAliveAtStartLost: true,
    followingRegularSeasonSlate: "contaminated", terminalPeriodConfirmed: true,
  }), "co-winners");
  assert.equal(decideSurvivorWipeout({
    sport: "nhl", week: 10, allAliveAtStartLost: true, followingRegularSeasonSlate: "unknown",
  }), "manual-review");
  assert.equal(decideSurvivorWipeout({
    sport: "nhl", week: 10, allAliveAtStartLost: true, followingRegularSeasonSlate: "contaminated",
  }), "manual-review");
  assert.equal(decideSurvivorWipeout({
    sport: "nba", week: 10, allAliveAtStartLost: true, followingRegularSeasonSlate: "contaminated",
  }), "manual-review");
  const repeat = { sport: "nhl" as const, week: 10, allAliveAtStartLost: true, followingRegularSeasonSlate: "confirmed" as const };
  assert.equal(decideSurvivorWipeout(repeat), decideSurvivorWipeout(repeat));
});
test("NHL and NBA terminal proof requires a complete season-end date", () => {
  const followingPeriodEnd = new Date("2026-04-19T23:59:59Z");
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nhl",
    followingRegularSeasonSlate: "unknown",
    followingSlateHasRegularSeasonGame: false,
    lastRegularSeasonGameDate: "2026-04-16T23:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), true);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nba",
    followingRegularSeasonSlate: "contaminated",
    followingSlateHasRegularSeasonGame: false,
    lastRegularSeasonGameDate: "2026-04-12T17:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), true);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nhl",
    followingRegularSeasonSlate: "confirmed",
    followingSlateHasRegularSeasonGame: true,
    lastRegularSeasonGameDate: "2026-04-16T23:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), false);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nhl",
    followingRegularSeasonSlate: "unknown",
    followingSlateHasRegularSeasonGame: false,
    lastRegularSeasonGameDate: "2026-04-25T23:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), false);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nba",
    followingRegularSeasonSlate: "unknown",
    followingSlateHasRegularSeasonGame: false,
    lastRegularSeasonGameDate: null,
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), false);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nba",
    followingRegularSeasonSlate: "contaminated",
    followingSlateHasRegularSeasonGame: true,
    lastRegularSeasonGameDate: "2026-04-16T23:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), false);
  assert.equal(isFinalCalendarSurvivorPeriod({
    sport: "nba",
    followingRegularSeasonSlate: "unknown",
    followingSlateHasRegularSeasonGame: false,
    lastRegularSeasonGameDate: "2026-04-16T23:00:00Z",
    currentPeriodEnd: new Date("2026-04-12T23:59:59Z"),
    followingPeriodEnd,
  }), false);
});

test("settled active non-NFL Survivor periods advance toward terminal periods", () => {
  for (const sport of ["nhl", "nba", "superleague"] as const) {
    assert.equal(shouldAdvanceLiveSurvivorPeriod({
      sport, finalized: true, poolActive: true,
    }), true);
  }
  assert.equal(shouldAdvanceLiveSurvivorPeriod({
    sport: "nfl", finalized: true, poolActive: true,
  }), false);
  assert.equal(shouldAdvanceLiveSurvivorPeriod({
    sport: "nba", finalized: false, poolActive: true,
  }), false);
  assert.equal(shouldAdvanceLiveSurvivorPeriod({
    sport: "nhl", finalized: true, poolActive: false,
  }), false);
});
test("multi-life effects are deterministic and repeat-safe", () => {
  assert.equal(survivorStateEffect({ result: "loss", strikeCount: 0, maxStrikes: 2 }), "strike");
  assert.equal(survivorStateEffect({ result: "forfeit", strikeCount: 2, maxStrikes: 2 }), "eliminate");
  assert.equal(survivorStateEffect({ result: "win", strikeCount: 1, maxStrikes: 2 }), "win");
  assert.equal(survivorStateEffect({ result: "push", strikeCount: 1, maxStrikes: 2 }), "none");
});
for (const sport of ["nfl", "nhl", "nba", "superleague"] as const) {
  test(`${sport}: terminal wipeout produces tied first-place prize`, () => {
    const decision = decideSurvivorWipeout({
      sport,
      week: sport === "nfl" ? 18 : sport === "superleague" ? 38 : 30,
      allAliveAtStartLost: true,
      followingRegularSeasonSlate:
        sport === "nhl" || sport === "nba" ? "unknown" : undefined,
      terminalPeriodConfirmed:
        sport === "nhl" || sport === "nba" ? true : undefined,
    });
    assert.equal(decision, "co-winners");
    const prizeAmount = calcPrize({
      prizeStructure: [{ place: 1, amount: 100 }, { place: 2, amount: 50 }],
      prizeMode: "fixed",
      entryFee: null,
      prizePot: null,
      totalEntries: 2,
      maxEntries: 2,
      placeIndex: 0,
      coWinners: 2,
    });
    assert.equal(prizeAmount, 75);
    assert.deepEqual(buildTerminalSurvivorClosurePlan([101, 202], prizeAmount), {
      entryIds: [101, 202],
      entryValues: {
        finalWinner: true,
        finishPosition: 1,
        prizeAmount: 75,
      },
      poolValues: {
        isActive: false,
        closureReason: "co_winners",
      },
    });
  });

  test(`${sport}: normal settlement still leaves exactly one survivor`, () => {
    const maxStrikes = sport === "nfl" ? 0 : 2;
    const effects = [
      survivorStateEffect({ result: "loss", strikeCount: maxStrikes, maxStrikes }),
      survivorStateEffect({ result: "win", strikeCount: 0, maxStrikes }),
    ];
    assert.deepEqual(effects, ["eliminate", "win"]);
    assert.equal(effects.filter(effect => effect !== "eliminate").length, 1);
  });
}
test("a postponed push is picked, safe, and prevents a wipeout", () => {
  assert.deepEqual(aggregateSurvivorOutcomes([1, 2], [
    { entryId: 1, result: "loss" },
    { entryId: 2, result: "push" },
  ]), {
    loserEntryIds: [1],
    allAliveAtStartLost: false,
  });
  assert.equal(survivorStateEffect({
    result: "push", strikeCount: 2, maxStrikes: 2,
  }), "none");
});
test("regular-season slate guards reject unfinished and contaminated events", () => {
  assert.equal(isCompleteRegularSeasonSlate([
    { seasonType: 2, isCompleted: true, isPostponed: false },
    { seasonType: 2, isCompleted: false, isPostponed: true },
  ]), true);
  assert.equal(isCompleteRegularSeasonSlate([
    { seasonType: 2, isCompleted: true, isPostponed: false },
    { seasonType: 3, isCompleted: true, isPostponed: false },
  ]), false);
  assert.equal(isCompleteRegularSeasonSlate([
    { seasonType: 2, isCompleted: false, isPostponed: false },
  ]), false);
  assert.equal(classifyFollowingRegularSeasonSlate([]), "unknown");
  assert.equal(classifyFollowingRegularSeasonSlate([{ seasonType: 2 }]), "confirmed");
  assert.equal(classifyFollowingRegularSeasonSlate([
    { seasonType: 2 }, { seasonType: 1 },
  ]), "contaminated");
});
test("Super League zero-pick weeks fail closed without start evidence", () => {
  assert.equal(resolveSuperLeagueSettlementBounds([]), null);
});
test("Super League picks define one shared Fri-Mon slate", () => {
  assert.deepEqual(resolveSuperLeagueSettlementBounds([
    "2026-04-10", "2026-04-13",
  ]), {
    weekStart: "2026-04-10", weekEnd: "2026-04-13",
  });
  assert.equal(resolveSuperLeagueSettlementBounds([
    "2026-04-13", "2026-04-17",
  ]), null);
  assert.equal(resolveSuperLeagueSettlementBounds([null]), null);
});