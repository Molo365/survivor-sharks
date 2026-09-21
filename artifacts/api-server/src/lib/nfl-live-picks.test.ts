import assert from "node:assert/strict";
import test from "node:test";
import type { EspnGame } from "./espn";
import { computeLiveCorrect } from "./nfl-live-picks";

function game(overrides: Partial<EspnGame> = {}): EspnGame {
  return {
    id: "game-1",
    date: "2026-09-20T17:00:00.000Z",
    status: "scheduled",
    homeTeam: { id: "home" } as EspnGame["homeTeam"],
    awayTeam: { id: "away" } as EspnGame["awayTeam"],
    homeScore: null,
    awayScore: null,
    homeRecord: null,
    awayRecord: null,
    isCompleted: false,
    isPostponed: false,
    hasStarted: false,
    liveState: null,
    homeStartingPitcher: null,
    awayStartingPitcher: null,
    groupLabel: null,
    seasonType: 2,
    homeLinescores: [],
    awayLinescores: [],
    ...overrides,
  };
}

test("counts picks for the leading home team", () => {
  const result = computeLiveCorrect(
    [game({ status: "in_progress", homeScore: 14, awayScore: 7 })],
    [
      { userId: 1, gameId: "game-1", pickedTeamId: "home" },
      { userId: 2, gameId: "game-1", pickedTeamId: "home" },
      { userId: 3, gameId: "game-1", pickedTeamId: "away" },
    ],
  );

  assert.deepEqual([...result.liveByUser.entries()].sort(), [[1, 1], [2, 1]]);
  assert.equal(result.liveGamesInProgress, 1);
});

test("counts no pick when the score is tied", () => {
  const result = computeLiveCorrect(
    [game({ status: "in_progress", homeScore: 7, awayScore: 7 })],
    [
      { userId: 1, gameId: "game-1", pickedTeamId: "home" },
      { userId: 2, gameId: "game-1", pickedTeamId: "away" },
    ],
  );

  assert.deepEqual([...result.liveByUser.entries()], []);
  assert.equal(result.liveGamesInProgress, 1);
});

test("counts picks for the leading away team", () => {
  const result = computeLiveCorrect(
    [game({ status: "in_progress", homeScore: 3, awayScore: 10 })],
    [{ userId: 1, gameId: "game-1", pickedTeamId: "away" }],
  );

  assert.deepEqual([...result.liveByUser.entries()], [[1, 1]]);
});

test("ignores final and scheduled games", () => {
  const result = computeLiveCorrect(
    [
      game({ id: "final", status: "final", homeScore: 14, awayScore: 7 }),
      game({ id: "scheduled", status: "scheduled", homeScore: 14, awayScore: 7 }),
    ],
    [
      { userId: 1, gameId: "final", pickedTeamId: "home" },
      { userId: 2, gameId: "scheduled", pickedTeamId: "home" },
    ],
  );

  assert.deepEqual([...result.liveByUser.entries()], []);
  assert.equal(result.liveGamesInProgress, 0);
});

test("counts several users across multiple live games", () => {
  const result = computeLiveCorrect(
    [
      game({ id: "game-1", status: "in_progress", homeScore: 10, awayScore: 3 }),
      game({ id: "game-2", status: "in_progress", homeScore: 0, awayScore: 6 }),
    ],
    [
      { userId: 1, gameId: "game-1", pickedTeamId: "home" },
      { userId: 1, gameId: "game-2", pickedTeamId: "away" },
      { userId: 2, gameId: "game-1", pickedTeamId: "home" },
      { userId: 3, gameId: "game-2", pickedTeamId: "home" },
    ],
  );

  assert.deepEqual(
    [...result.liveByUser.entries()].sort(),
    [[1, 2], [2, 1]],
  );
  assert.equal(result.liveGamesInProgress, 2);
});

test("ignores a live game with a null score", () => {
  const result = computeLiveCorrect(
    [game({ status: "in_progress", homeScore: null, awayScore: 7 })],
    [{ userId: 1, gameId: "game-1", pickedTeamId: "away" }],
  );

  assert.deepEqual([...result.liveByUser.entries()], []);
  assert.equal(result.liveGamesInProgress, 0);
});