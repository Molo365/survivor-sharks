import assert from "node:assert/strict";
import test from "node:test";
import {
  type ConfidenceSubmissionGame,
  type ConfidenceSubmissionPick,
  sortConfidenceGamesByKickoff,
  validateConfidenceSubmission,
} from "./confidence-submission";

const nowMs = Date.parse("2026-09-20T12:00:00.000Z");

function game(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  date = "2026-09-20T17:00:00.000Z",
): ConfidenceSubmissionGame {
  return {
    id,
    date,
    homeTeam: { id: homeTeamId },
    awayTeam: { id: awayTeamId },
  };
}

const games = [
  game("game-1", "home-1", "away-1"),
  game("game-2", "home-2", "away-2", "2026-09-20T20:00:00.000Z"),
];

function validPicks(): ConfidenceSubmissionPick[] {
  return [
    { gameId: "game-1", pickedTeamId: "home-1", confidencePoints: 1 },
    { gameId: "game-2", pickedTeamId: "away-2", confidencePoints: 2 },
  ];
}

test("accepts a correct confidence submission", () => {
  assert.deepEqual(validateConfidenceSubmission({ picks: validPicks(), games, nowMs }), { ok: true });
});

test("rejects the wrong pick count", () => {
  assert.deepEqual(
    validateConfidenceSubmission({ picks: validPicks().slice(0, 1), games, nowMs }),
    { ok: false, error: "Expected 2 picks, got 1" },
  );
});

test("rejects an unknown game", () => {
  const picks = validPicks();
  picks[1] = { ...picks[1], gameId: "unknown" };
  assert.deepEqual(
    validateConfidenceSubmission({ picks, games, nowMs }),
    { ok: false, error: "Unknown game: unknown" },
  );
});

test("rejects a duplicate game even when the pick count matches", () => {
  const picks = validPicks();
  picks[1] = { ...picks[1], gameId: "game-1", pickedTeamId: "away-1" };
  assert.deepEqual(
    validateConfidenceSubmission({ picks, games, nowMs }),
    { ok: false, error: "Duplicate game: game-1" },
  );
});

test("rejects a game that has started", () => {
  const startedGames = [
    game("game-1", "home-1", "away-1", "2026-09-20T11:59:59.000Z"),
    games[1],
  ];
  assert.deepEqual(
    validateConfidenceSubmission({ picks: validPicks(), games: startedGames, nowMs }),
    { ok: false, error: "Game game-1 has already locked" },
  );
});

test("rejects duplicate confidence values", () => {
  const picks = validPicks();
  picks[1] = { ...picks[1], confidencePoints: 1 };
  assert.deepEqual(
    validateConfidenceSubmission({ picks, games, nowMs }),
    { ok: false, error: "Confidence points 1-2 must each be used exactly once" },
  );
});

test("rejects an out-of-range confidence value", () => {
  const picks = validPicks();
  picks[1] = { ...picks[1], confidencePoints: 3 };
  assert.deepEqual(
    validateConfidenceSubmission({ picks, games, nowMs }),
    { ok: false, error: "Confidence points 1-2 must each be used exactly once" },
  );
});

test("rejects a team that is not in the game", () => {
  const picks = validPicks();
  picks[0] = { ...picks[0], pickedTeamId: "another-team" };
  assert.deepEqual(
    validateConfidenceSubmission({ picks, games, nowMs }),
    { ok: false, error: "Invalid team for game game-1" },
  );
});

test("sorts games by kickoff so the final game is deterministic", () => {
  assert.deepEqual(
    sortConfidenceGamesByKickoff([games[1], games[0]]).map((scheduledGame) => scheduledGame.id),
    ["game-1", "game-2"],
  );
});