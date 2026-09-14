import assert from "node:assert/strict";
import test from "node:test";
import {
  getMlbSeasonBoundaryWindow,
  hasMlbRegularSeasonEnded,
  type MlbSeasonBoundaryGame,
} from "./mlb-season-boundary";
import {
  fetchGamesForDateChecked,
  fetchMlbWeekGamesChecked,
} from "./espn";

function game(
  seasonType: number,
  status: MlbSeasonBoundaryGame["status"],
  seasonYear = 2026,
): MlbSeasonBoundaryGame {
  return { seasonType, seasonYear, status };
}

test("detects the boundary only after regular-season games finish and postseason is scheduled", () => {
  assert.equal(hasMlbRegularSeasonEnded([
    game(2, "final"),
    game(2, "postponed"),
    game(3, "scheduled"),
  ], 2026), true);
});

test("fails open while any regular-season game remains unfinished", () => {
  assert.equal(hasMlbRegularSeasonEnded([
    game(2, "final"),
    game(2, "scheduled"),
    game(3, "scheduled"),
  ], 2026), false);
  assert.equal(hasMlbRegularSeasonEnded([
    game(2, "suspended"),
    game(3, "scheduled"),
  ], 2026), false);
});

test("fails open without affirmative same-season regular and postseason evidence", () => {
  assert.equal(hasMlbRegularSeasonEnded([game(2, "final")], 2026), false);
  assert.equal(hasMlbRegularSeasonEnded([game(3, "scheduled")], 2026), false);
  assert.equal(hasMlbRegularSeasonEnded([
    game(2, "final", 2025),
    game(3, "scheduled", 2025),
  ], 2026), false);
  assert.equal(hasMlbRegularSeasonEnded([], 2026), false);
});

test("uses a durable bounded range covering the regular-season finish and postseason", () => {
  assert.deepEqual(
    getMlbSeasonBoundaryWindow(2026),
    { startDate: "20260901", endDate: "20261231" },
  );
});

test("locally filters MLB date responses by parsed ESPN season type", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    events: [
      { id: "regular", date: "2026-09-27T17:00:00Z", season: { year: 2026, type: 2 } },
      { id: "postseason", date: "2026-09-29T17:00:00Z", season: { year: 2026, type: 3 } },
    ],
  }), { status: 200 });
  try {
    const games = await fetchGamesForDateChecked("mlb", "20260927", 2, true);
    assert.deepEqual(games?.map((item) => item.id), ["regular"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checked MLB fetches fail open on malformed or failed daily responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });
    assert.equal(await fetchGamesForDateChecked("mlb", "20260927", 2, true), null);

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("20260928")) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ events: [] }), { status: 200 });
    };
    assert.equal(await fetchMlbWeekGamesChecked(["20260927", "20260928"], 2), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});