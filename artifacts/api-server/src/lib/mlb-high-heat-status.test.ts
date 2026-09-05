import test from "node:test";
import assert from "node:assert/strict";
import { getMlbHighHeatRequiredPickCount } from "./mlb-high-heat-rules";

function game(status: string, date: string) {
  return { status, date } as any;
}

test("requires up to eight currently available MLB games", () => {
  const now = Date.parse("2026-09-05T12:00:00Z");
  const games = Array.from({ length: 15 }, (_, index) =>
    game("scheduled", `2026-09-05T${String(index + 13).padStart(2, "0")}:00:00Z`),
  );

  assert.equal(getMlbHighHeatRequiredPickCount(games, now), 8);
});

test("does not require picks for games that have already started or finished", () => {
  const now = Date.parse("2026-09-05T20:00:00Z");
  const games = [
    game("final", "2026-09-05T13:00:00Z"),
    game("in_progress", "2026-09-05T16:00:00Z"),
    game("scheduled", "2026-09-05T21:00:00Z"),
  ];

  assert.equal(getMlbHighHeatRequiredPickCount(games, now), 1);
});

test("returns no requirement for an empty slate", () => {
  assert.equal(getMlbHighHeatRequiredPickCount([], Date.now()), 0);
});