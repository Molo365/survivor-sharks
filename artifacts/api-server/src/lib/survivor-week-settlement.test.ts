import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateSurvivorOutcomes,
  classifyFollowingRegularSeasonSlate,
  decideSurvivorWipeout,
  isCompleteRegularSeasonSlate,
  resolveSuperLeagueSettlementBounds,
  survivorStateEffect,
} from "./survivor-week-settlement";

for (const sport of ["nfl", "nhl", "nba", "superleague"] as const) {
  test(`${sport}: nonterminal wipeout voids`, () => {
    assert.equal(decideSurvivorWipeout({
      sport, week: sport === "superleague" ? 37 : 10, allAliveAtStartLost: true,
      followingRegularSeasonSlate: sport === "nhl" || sport === "nba" ? "confirmed" : undefined,
    }), "void");
  });
}
test("mixed results and terminal or unknown terminal do not void", () => {
  assert.equal(decideSurvivorWipeout({ sport: "nfl", week: 10, allAliveAtStartLost: false }), "normal");
  assert.equal(decideSurvivorWipeout({ sport: "nfl", week: 18, allAliveAtStartLost: true }), "manual-review");
  assert.equal(decideSurvivorWipeout({ sport: "superleague", week: 38, allAliveAtStartLost: true }), "manual-review");
  assert.equal(decideSurvivorWipeout({ sport: "nba", week: 10, allAliveAtStartLost: true }), "manual-review");
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
test("multi-life effects are deterministic and repeat-safe", () => {
  assert.equal(survivorStateEffect({ result: "loss", strikeCount: 0, maxStrikes: 2 }), "strike");
  assert.equal(survivorStateEffect({ result: "forfeit", strikeCount: 2, maxStrikes: 2 }), "eliminate");
  assert.equal(survivorStateEffect({ result: "win", strikeCount: 1, maxStrikes: 2 }), "win");
  assert.equal(survivorStateEffect({ result: "push", strikeCount: 1, maxStrikes: 2 }), "none");
});
test("normal NFL settlement still leaves exactly one survivor", () => {
  const effects = [
    survivorStateEffect({ result: "loss", strikeCount: 0, maxStrikes: 0 }),
    survivorStateEffect({ result: "win", strikeCount: 0, maxStrikes: 0 }),
  ];
  assert.deepEqual(effects, ["eliminate", "win"]);
  assert.equal(effects.filter(effect => effect !== "eliminate").length, 1);
});
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