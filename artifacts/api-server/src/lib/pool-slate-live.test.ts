import assert from "node:assert/strict";
import test from "node:test";
import { openSlateGames, isUnpickableSlateGame } from "./pool-slate-live";
import type { EspnGame } from "./espn";

function game(overrides: Partial<EspnGame> & { id: string }): EspnGame {
  const base = {
    id: overrides.id,
    date: new Date(Date.now() + 86_400_000).toISOString(),
    status: "scheduled" as const,
    isPostponed: false,
    isCompleted: false,
    hasStarted: false,
    homeTeam: { id: "1", abbreviation: "H", displayName: "Home" },
    awayTeam: { id: "2", abbreviation: "A", displayName: "Away" },
    homeScore: null,
    awayScore: null,
  };
  return { ...base, ...overrides } as EspnGame;
}

test("isUnpickableSlateGame covers ESPN postponed flags", () => {
  assert.equal(isUnpickableSlateGame({ status: "scheduled", isPostponed: true }), true);
  assert.equal(isUnpickableSlateGame({ status: "postponed", isPostponed: false }), true);
  assert.equal(isUnpickableSlateGame({ status: "suspended" }), true);
  assert.equal(isUnpickableSlateGame({ status: "scheduled", isPostponed: false }), false);
});

test("openSlateGames drops postponed games still before kickoff", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const open = openSlateGames([
    game({ id: "pickable", date: future }),
    game({ id: "ppd", date: future, status: "postponed" }),
  ]);
  assert.deepEqual(open.map((g) => g.id), ["pickable"]);
});

test("openSlateGames drops locked kickoffs", () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const open = openSlateGames([game({ id: "locked", date: past })]);
  assert.equal(open.length, 0);
});
