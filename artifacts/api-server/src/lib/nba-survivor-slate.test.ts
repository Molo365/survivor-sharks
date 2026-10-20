import assert from "node:assert/strict";
import test from "node:test";
import {
  nbaSurvivorSlateForSettlement,
  nbaSurvivorWeekLabel,
  weekendGamesEt,
} from "./nba-survivor-slate";

test("keeps only Friday–Sunday games in Eastern Time", () => {
  const friday = { id: "fri", date: "2026-01-02T23:00:00.000Z" };
  const thursday = { id: "thu", date: "2026-01-02T02:00:00.000Z" };

  assert.deepEqual(weekendGamesEt([friday, thursday]), [friday]);
});

test("nbaSurvivorSlateForSettlement falls back when no weekend games exist", () => {
  const games = [{ id: "mon", date: "2026-01-05T18:00:00.000Z" }];
  assert.equal(nbaSurvivorSlateForSettlement(games), games);
});

test("nbaSurvivorWeekLabel uses the Fri–Sun range for the pool week", () => {
  const createdAt = new Date("2026-10-20T12:00:00.000Z");
  const label = nbaSurvivorWeekLabel(createdAt, 1, false);
  assert.match(label, /^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/);
});
