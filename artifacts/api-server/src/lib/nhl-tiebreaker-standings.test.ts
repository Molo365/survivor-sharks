import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNbaPointsTiebreakerColumnHeader,
  formatNhlSogTiebreakerColumnHeader,
  revealTiebreakerGuessForStandings,
} from "./nhl-tiebreaker-standings";

describe("NHL weekly tiebreaker standings visibility", () => {
  const nhlWeekly = { sport: "nhl", poolType: "pickem", pickFrequency: "weekly" };

  it("hides NHL weekly guesses until pool lock (kickoffReveal gate)", () => {
    assert.equal(revealTiebreakerGuessForStandings(nhlWeekly, 48, false), false);
    assert.equal(revealTiebreakerGuessForStandings(nhlWeekly, 48, true), true);
    assert.equal(revealTiebreakerGuessForStandings(nhlWeekly, null, true), false);
  });

  it("keeps kickoff gate for non-NHL weekly pools", () => {
    const mlbWeekly = { sport: "mlb", poolType: "pickem", pickFrequency: "weekly" };
    assert.equal(revealTiebreakerGuessForStandings(mlbWeekly, 10, false), false);
    assert.equal(revealTiebreakerGuessForStandings(mlbWeekly, 10, true), true);
  });

  it("hides NBA ATS guesses until pool lock (kickoffReveal gate)", () => {
    const nbaAts = { sport: "nba", poolType: "nba_ats", pickFrequency: "weekly" };
    assert.equal(revealTiebreakerGuessForStandings(nbaAts, 218, false), false);
    assert.equal(revealTiebreakerGuessForStandings(nbaAts, 218, true), true);
  });

  it("formats the standings column header with actual or TBD", () => {
    assert.equal(formatNhlSogTiebreakerColumnHeader("BUF", "TOR", 52), "BUF/TOR SOG (52)");
    assert.equal(formatNhlSogTiebreakerColumnHeader("BUF", "TOR", null), "BUF/TOR SOG (TBD)");
  });

  it("formats NBA Fast Break PTS column header", () => {
    assert.equal(formatNbaPointsTiebreakerColumnHeader("LAL", "BOS", 224), "LAL/BOS PTS (224)");
    assert.equal(formatNbaPointsTiebreakerColumnHeader("LAL", "BOS", null), "LAL/BOS PTS (TBD)");
  });
});
