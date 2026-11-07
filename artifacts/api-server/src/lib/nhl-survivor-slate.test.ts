import assert from "node:assert/strict";
import test from "node:test";
import {
  formatShortMonthDayEt,
  isNhlSurvivorSeasonPool,
  nhlSurvivorSeasonSlateRevealed,
  nhlSurvivorSeasonWeekSubmissionLocked,
  nhlSurvivorSlateForSettlement,
  nhlSurvivorWeekLabel,
  saturdayGamesEt,
  survivorGridSlateIsosForWeek,
} from "./nhl-survivor-slate";

test("keeps only Saturday games in Eastern Time", () => {
  const saturday = { id: "sat", date: "2026-01-03T18:00:00.000Z" };
  const sunday = { id: "sun", date: "2026-01-04T18:00:00.000Z" };

  assert.deepEqual(saturdayGamesEt([saturday, sunday]), [saturday]);
});

test("treats a late Saturday ET game as Saturday", () => {
  const lateSaturday = { id: "late-sat", date: "2026-01-04T04:00:00.000Z" };

  assert.deepEqual(saturdayGamesEt([lateSaturday]), [lateSaturday]);
});

test("falls back to the original games when no Saturday exists", () => {
  const games = [
    { id: "sun", date: "2026-01-04T18:00:00.000Z" },
    { id: "mon", date: "2026-01-05T18:00:00.000Z" },
  ];

  assert.equal(nhlSurvivorSlateForSettlement(games), games);
});

test("formatShortMonthDayEt renders ET month and day", () => {
  assert.equal(formatShortMonthDayEt("2026-10-24"), "Oct 24");
});

test("nhlSurvivorWeekLabel uses the Saturday date for the pool week", () => {
  const createdAt = new Date("2026-10-01T12:00:00.000Z");
  const label = nhlSurvivorWeekLabel(createdAt, 4, null);
  assert.match(label, /^[A-Z][a-z]{2} \d{1,2}$/);
});

test("isNhlSurvivorSeasonPool matches NHL season only", () => {
  assert.equal(isNhlSurvivorSeasonPool({ sport: "nhl", poolType: "season" }), true);
  assert.equal(isNhlSurvivorSeasonPool({ sport: "nhl", poolType: "pickem" }), false);
});

test("NHL survivor locks and reveals at Saturday 7 PM ET", () => {
  const pool = {
    createdAt: new Date("2026-10-06T12:00:00.000Z"),
    initialPeriodStart: null,
    sandboxMode: false,
  };
  const week = 1;
  const slate = [{ date: "2026-11-07T17:00:00.000Z" }];
  const beforeLock = new Date("2026-11-07T23:30:00.000Z").getTime(); // 6:30 PM ET
  const afterLock = new Date("2026-11-08T00:30:00.000Z").getTime(); // 7:30 PM ET
  assert.equal(nhlSurvivorSeasonWeekSubmissionLocked(pool, week, slate, beforeLock), false);
  assert.equal(nhlSurvivorSeasonWeekSubmissionLocked(pool, week, slate, afterLock), true);
  assert.equal(
    nhlSurvivorSeasonSlateRevealed(pool, week, slate.map((g) => g.date), beforeLock),
    false,
  );
  assert.equal(
    nhlSurvivorSeasonSlateRevealed(pool, week, slate.map((g) => g.date), afterLock),
    true,
  );
});

test("survivorGridSlateIsosForWeek dedupes kickoffs per week", () => {
  const map = new Map<string, Date>([
    ["3:team-a", new Date("2026-01-10T17:00:00.000Z")],
    ["3:team-b", new Date("2026-01-10T17:00:00.000Z")],
    ["4:team-c", new Date("2026-01-17T17:00:00.000Z")],
  ]);
  assert.deepEqual(survivorGridSlateIsosForWeek(map, 3), ["2026-01-10T17:00:00.000Z"]);
});