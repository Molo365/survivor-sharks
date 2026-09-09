import assert from "node:assert/strict";
import test from "node:test";
import type { EspnGame } from "./espn";
import {
  isThreeWayPickEmSport,
  threeWayPickEmOutcome,
} from "./pickem-grading";

function game(overrides: Partial<EspnGame> = {}): EspnGame {
  return {
    id: "game-1",
    date: "2026-09-08T19:00:00Z",
    status: "final",
    homeTeam: { id: "home", abbreviation: "H", displayName: "Home" },
    awayTeam: { id: "away", abbreviation: "A", displayName: "Away" },
    homeScore: 2,
    awayScore: 1,
    isCompleted: true,
    isPostponed: false,
    hasStarted: true,
    liveState: null,
    homeRecord: null,
    awayRecord: null,
    homeStartingPitcher: null,
    awayStartingPitcher: null,
    groupLabel: null,
    seasonType: 2,
    homeLinescores: [],
    awayLinescores: [],
    regulationHomeScore: 2,
    regulationAwayScore: 1,
    ...overrides,
  };
}

test("all soccer and World Cup Pick-Em sports use three-way grading", () => {
  for (const sport of ["worldcup", "intl", "mls", "superleague", "championsleague"]) {
    assert.equal(isThreeWayPickEmSport(sport), true, sport);
  }
  for (const sport of ["mlb", "nba", "nhl", "nfl"]) {
    assert.equal(isThreeWayPickEmSport(sport), false, sport);
  }
});

test("Champions League grades home, away, and draw from regulation", () => {
  assert.equal(threeWayPickEmOutcome("championsleague", game()), "home_win");
  assert.equal(threeWayPickEmOutcome("championsleague", game({
    regulationHomeScore: 1,
    regulationAwayScore: 3,
  })), "away_win");
  assert.equal(threeWayPickEmOutcome("championsleague", game({
    regulationHomeScore: 2,
    regulationAwayScore: 2,
  })), "draw");
});

test("Champions League remains pending without a reliable regulation result", () => {
  assert.equal(threeWayPickEmOutcome("championsleague", game({
    regulationHomeScore: null,
    regulationAwayScore: null,
  })), null);
});

test("existing three-way sports continue grading from final scores", () => {
  for (const sport of ["worldcup", "intl", "mls", "superleague"]) {
    assert.equal(threeWayPickEmOutcome(sport, game()), "home_win", sport);
  }
});