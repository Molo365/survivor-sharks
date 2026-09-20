import assert from "node:assert/strict";
import test from "node:test";
import { nhlSurvivorSlateForSettlement, saturdayGamesEt } from "./nhl-survivor-slate";

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