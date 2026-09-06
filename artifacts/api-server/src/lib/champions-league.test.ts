import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeChampionsLeagueMetadata,
  regulationScoreFromEspn,
} from "./espn";
import {
  championsLeagueRegulationOutcome,
  isThreeWayPickOption,
} from "./champions-league-pickem";

describe("Champions League ESPN normalization", () => {
  it("keeps league phase matchdays as one metadata period", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - League Phase - Matchday 6"),
      { phaseSlug: "league-phase", phaseLabel: "League Phase", matchday: 6 },
    );
  });

  it("labels both knockout legs without treating them as aggregate picks", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Quarterfinals - 1st Leg"),
      { phaseSlug: "quarterfinals", phaseLabel: "Quarterfinals", legNumber: 1, legLabel: "1st Leg" },
    );
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Semifinals - 2nd Leg"),
      { phaseSlug: "semifinals", phaseLabel: "Semifinals", legNumber: 2, legLabel: "2nd Leg" },
    );
  });

  it("never gives the final a leg artifact", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Final - 1st Leg"),
      { phaseSlug: "final", phaseLabel: "Final" },
    );
  });

  it("grades an extra-time match from its two regulation periods only", () => {
    const home = { score: "3", linescores: [{ period: 1, value: 1 }, { period: 2, value: 0 }, { period: 3, value: 2 }] };
    const away = { score: "1", linescores: [{ period: 1, value: 0 }, { period: 2, value: 1 }, { period: 3, value: 0 }] };
    assert.deepEqual(regulationScoreFromEspn(home, away, "Final/Extra Time"), { homeScore: 1, awayScore: 1 });
  });

  it("does not fall back to the extra-time final score when regulation is absent", () => {
    assert.deepEqual(
      regulationScoreFromEspn({ score: "2" }, { score: "1" }, "Final - AET"),
      { homeScore: null, awayScore: null },
    );
  });
});

describe("Champions League Pick-Em decisions", () => {
  it("accepts each of the three submission options and rejects team IDs", () => {
    for (const option of ["home_win", "draw", "away_win"]) {
      assert.equal(isThreeWayPickOption(option), true);
    }
    // The route calls this predicate before storing picks, so a team ID cannot
    // accidentally become a two-way selection in a 3-way competition.
    assert.equal(isThreeWayPickOption("real-madrid"), false);
    assert.equal(isThreeWayPickOption("home"), false);
    assert.equal(isThreeWayPickOption("penalties"), false);
  });

  it("uses the individual event's regulation result, not its ET final", () => {
    const extraTimeFixture = {
      isCompleted: true,
      // The match was level after 90, then home won in extra time.
      homeScore: 3,
      awayScore: 1,
      regulationHomeScore: 1,
      regulationAwayScore: 1,
    };
    assert.equal(championsLeagueRegulationOutcome(extraTimeFixture), "draw");
  });

  it("refuses the grading decision for extra time when ESPN lacks regulation", () => {
    const incompleteRegulationFixture = {
      isCompleted: true,
      homeScore: 2,
      awayScore: 1,
      regulationHomeScore: null,
      regulationAwayScore: null,
    };
    assert.equal(championsLeagueRegulationOutcome(incompleteRegulationFixture), null);
  });
});