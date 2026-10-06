import assert from "node:assert/strict";
import test from "node:test";
import type { NflPickEmSeasonLeaderboardEntry } from "@workspace/api-client-react";
import { getLeaders, resolveLeaderChipLeftDisplay, shouldShowNflPickEmSeasonCurrentWeekLeader } from "./leaderChips";

function entry(
  overrides: Partial<NflPickEmSeasonLeaderboardEntry> = {},
): NflPickEmSeasonLeaderboardEntry {
  return {
    rank: 1,
    userId: 1,
    username: "username",
    displayName: null,
    seasonCorrect: 0,
    seasonTotal: 0,
    potSplit: false,
    weeklyScores: {},
    ...overrides,
  };
}

test("returns a single season leader", () => {
  const leaders = getLeaders(
    [
      entry({ seasonCorrect: 8 }),
      entry({ userId: 2, username: "runner-up", seasonCorrect: 6 }),
    ],
    3,
  );

  assert.deepEqual(leaders.season, { names: ["username"], points: 8, live: 0 });
});

test("returns all tied season leaders", () => {
  const leaders = getLeaders(
    [
      entry({ seasonCorrect: 8 }),
      entry({ userId: 2, username: "co-leader", seasonCorrect: 8 }),
    ],
    3,
  );

  assert.deepEqual(leaders.season, {
    names: ["username", "co-leader"],
    points: 8,
    live: 0,
  });
});

test("returns null for all-zero leaders", () => {
  const leaders = getLeaders(
    [entry(), entry({ userId: 2, username: "another" })],
    3,
  );

  assert.equal(leaders.season, null);
  assert.equal(leaders.week, null);
});

test("gets the week leader from the requested week", () => {
  const leaders = getLeaders(
    [
      entry({ weeklyScores: { "2": { correct: 4, total: 5 } } }),
      entry({
        userId: 2,
        username: "week-leader",
        weeklyScores: { "3": { correct: 5, total: 5 } },
      }),
    ],
    3,
  );

  assert.deepEqual(leaders.week, {
    names: ["week-leader"],
    points: 5,
    live: 0,
  });
});

test("prefers displayName over username", () => {
  const leaders = getLeaders(
    [entry({ displayName: "Display Name", seasonCorrect: 3 })],
    1,
  );

  assert.deepEqual(leaders.season, {
    names: ["Display Name"],
    points: 3,
    live: 0,
  });
});

test("adds live points to the season leader total", () => {
  const leaders = getLeaders(
    [
      entry({ seasonCorrect: 8, liveCorrect: 2 }),
      entry({ userId: 2, username: "official-leader", seasonCorrect: 9 }),
    ],
    3,
  );

  assert.deepEqual(leaders.season, {
    names: ["username"],
    points: 10,
    live: 2,
  });
});

test("uses live points for week leaders and keeps the largest tied live value", () => {
  const leaders = getLeaders(
    [
      entry({
        weeklyScores: { "3": { correct: 3, total: 5 } },
        liveCorrect: 2,
      }),
      entry({
        userId: 2,
        username: "tied-week-leader",
        weeklyScores: { "3": { correct: 4, total: 5 } },
        liveCorrect: 1,
      }),
    ],
    3,
  );

  assert.deepEqual(leaders.week, {
    names: ["username", "tied-week-leader"],
    points: 5,
    live: 2,
  });
});

test("shouldShowNflPickEmSeasonCurrentWeekLeader is false on Thursday", () => {
  const thu = new Date("2026-10-09T18:00:00-04:00");
  assert.equal(shouldShowNflPickEmSeasonCurrentWeekLeader(thu), false);
});

test("shouldShowNflPickEmSeasonCurrentWeekLeader is false Sunday before 5pm ET", () => {
  const sunAfternoon = new Date("2026-10-11T16:00:00-04:00");
  assert.equal(shouldShowNflPickEmSeasonCurrentWeekLeader(sunAfternoon), false);
});

test("shouldShowNflPickEmSeasonCurrentWeekLeader is true Sunday at 5pm ET", () => {
  const sunEvening = new Date("2026-10-11T17:00:00-04:00");
  assert.equal(shouldShowNflPickEmSeasonCurrentWeekLeader(sunEvening), true);
});

test("shouldShowNflPickEmSeasonCurrentWeekLeader is true on Monday", () => {
  const mon = new Date("2026-10-12T10:00:00-04:00");
  assert.equal(shouldShowNflPickEmSeasonCurrentWeekLeader(mon), true);
});

test("resolveLeaderChipLeftDisplay shows previous week winner before Sunday evening", () => {
  const tue = new Date("2026-10-07T12:00:00-04:00");
  const left = resolveLeaderChipLeftDisplay({
    currentWeek: 5,
    leaders: getLeaders(
      [entry({ weeklyScores: { "5": { correct: 1, total: 1 } } })],
      5,
    ),
    previousWeekNumber: 4,
    previousWeekWinners: [{ username: "winner", correct: 12 }],
    now: tue,
  });
  assert.equal(left.mode, "previous-week");
  assert.equal(left.weekNumber, 4);
  assert.deepEqual(left.leader?.names, ["winner"]);
});

test("resolveLeaderChipLeftDisplay shows current week leader Sunday night", () => {
  const sun = new Date("2026-10-11T18:00:00-04:00");
  const left = resolveLeaderChipLeftDisplay({
    currentWeek: 5,
    leaders: getLeaders(
      [
        entry({ weeklyScores: { "5": { correct: 8, total: 10 } } }),
        entry({ userId: 2, username: "other", weeklyScores: { "5": { correct: 6, total: 10 } } }),
      ],
      5,
    ),
    previousWeekNumber: 4,
    previousWeekWinners: [{ username: "old", correct: 12 }],
    now: sun,
  });
  assert.equal(left.mode, "current-week");
  assert.equal(left.weekNumber, 5);
  assert.deepEqual(left.leader?.names, ["username"]);
});