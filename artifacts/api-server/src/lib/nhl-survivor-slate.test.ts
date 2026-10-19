import assert from "node:assert/strict";
import test from "node:test";
import {
  formatShortMonthDayEt,
  nhlSurvivorSlateForSettlement,
  nhlSurvivorWeekLabel,
  saturdayGamesEt,
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
  const label = nhlSurvivorWeekLabel(createdAt, 4, "2026-10-06");
  assert.match(label, /^[A-Z][a-z]{2} \d{1,2}$/);
});