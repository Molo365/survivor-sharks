import assert from "node:assert/strict";
import test from "node:test";
import { isFinalizedPickResult, joinBlockedByStart, resolvePoolStart, resolveWeeklyBonusThreshold, type PoolStartPool } from "./pool-start";

const base: PoolStartPool = { id: 1, sport: "nfl", poolType: "season", currentWeek: 1, startWeek: null, season: 2026, isPreseason: false, pickFrequency: "weekly", sandboxMode: false, createdAt: new Date("2026-09-01T00:00:00Z"), initialPeriodStart: null };
const game = (date: string, hasStarted = false) => ({ date, hasStarted });
const deps = (games: ReturnType<typeof game>[] | null, persisted = false) => ({
  now: () => new Date("2026-09-10T20:00:00Z"),
  gamesFor: async () => games,
  sandboxStarted: async () => false,
  persistedStarted: async () => persisted,
});

test("NFL startWeek boundary starts when its first scheduled game begins", async () => {
  const state = await resolvePoolStart({ ...base, startWeek: 4, currentWeek: 4 }, deps([game("2026-09-25T00:20:00Z", true)]));
  assert.equal(state.joinBlockedReason, "survivor_started");
});
test("scheduled kickoff is false before its timestamp and true exactly at it", async () => {
  const kickoff = "2026-09-10T20:00:00Z";
  const before = await resolvePoolStart(base, { ...deps([game(kickoff)]), now: () => new Date("2026-09-10T19:59:59Z") });
  const at = await resolvePoolStart(base, { ...deps([game(kickoff)]), now: () => new Date(kickoff) });
  assert.equal(before.hasStarted, false);
  assert.equal(at.hasStarted, true);
});
test("NHL, NBA, and Super League start on first game", async () => {
  for (const sport of ["nhl", "nba", "superleague"]) {
    const state = await resolvePoolStart({ ...base, sport }, deps([game("2099-01-01T00:00:00Z", true)]));
    assert.equal(state.hasStarted, true);
  }
});
test("sandbox uses pool replay state", async () => {
  const state = await resolvePoolStart({ ...base, sandboxMode: true }, { ...deps(null), sandboxStarted: async () => true });
  assert.equal(state.joinBlockedReason, "survivor_started");
});
test("persisted progression blocks despite provider failure, new pool does not", async () => {
  const unavailable = { ...deps(null), gamesFor: async () => { throw new Error("provider unavailable"); } };
  assert.equal((await resolvePoolStart(base, { ...unavailable, persistedStarted: async () => true })).hasStarted, true);
  assert.equal((await resolvePoolStart(base, unavailable)).hasStarted, false);
});
test("pending pre-kickoff selections are not persisted start evidence", async () => {
  assert.equal(isFinalizedPickResult("pending"), false);
  assert.equal(isFinalizedPickResult("win"), true);
  assert.equal(isFinalizedPickResult("loss"), true);
  const preKickoff = await resolvePoolStart(base, deps([game("2026-09-11T00:00:00Z")], false));
  assert.equal(preKickoff.joinBlockedReason, null);
});
test("non-survivor start is informational only", async () => {
  const state = await resolvePoolStart({ ...base, poolType: "pickem" }, deps([game("2099-01-01", true)]));
  assert.equal(state.hasStarted, true);
  assert.equal(state.joinBlockedReason, null);
  assert.equal(joinBlockedByStart("pickem", true), false);
});
test("pre-lock non-Survivor submissions do not produce a warning", async () => {
  const state = await resolvePoolStart({ ...base, poolType: "pickem" }, deps([game("2026-09-11T00:00:00Z")], false));
  assert.equal(state.hasStarted, false);
  assert.equal(state.joinBlockedReason, null);
});

for (const poolType of ["pickem_season", "nfl_confidence"]) {
  test(`${poolType} recalculates the weekly bonus when enrollment reaches the threshold`, () => {
    const input = {
      poolType,
      weeklyBonusEnabled: true,
      weeklyBonusMinPlayers: 10,
      isResolved: false,
      persistedThreshold: false,
    };
    assert.equal(resolveWeeklyBonusThreshold({ ...input, playerCount: 9 }), false);
    assert.equal(resolveWeeklyBonusThreshold({ ...input, playerCount: 10 }), true);
  });

  test(`${poolType} preserves the existing decision for a resolved week`, () => {
    const input = {
      poolType,
      weeklyBonusEnabled: true,
      weeklyBonusMinPlayers: 10,
      playerCount: 20,
      isResolved: true,
    };
    assert.equal(resolveWeeklyBonusThreshold({ ...input, persistedThreshold: false }), false);
    assert.equal(resolveWeeklyBonusThreshold({ ...input, persistedThreshold: true }), true);
  });
}

test("weekly bonus remains off when disabled, unconfigured, or used by an unsupported pool", () => {
  const baseThreshold = {
    poolType: "pickem_season",
    weeklyBonusEnabled: true,
    weeklyBonusMinPlayers: 10,
    playerCount: 20,
    isResolved: false,
    persistedThreshold: null,
  };
  assert.equal(resolveWeeklyBonusThreshold({ ...baseThreshold, weeklyBonusEnabled: false }), false);
  assert.equal(resolveWeeklyBonusThreshold({ ...baseThreshold, weeklyBonusMinPlayers: null }), false);
  assert.equal(resolveWeeklyBonusThreshold({ ...baseThreshold, poolType: "pickem" }), false);
});

test("nhl recurring weekly pick-em uses enrollment for closed weeks", () => {
  const input = {
    poolType: "pickem",
    sport: "nhl",
    pickFrequency: "weekly",
    isRecurring: true,
    weeklyBonusEnabled: true,
    weeklyBonusMinPlayers: 5,
    isResolved: true,
    persistedThreshold: false,
  };
  assert.equal(resolveWeeklyBonusThreshold({ ...input, playerCount: 4 }), false);
  assert.equal(resolveWeeklyBonusThreshold({ ...input, playerCount: 5 }), true);
});