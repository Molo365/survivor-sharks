import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNbaPointsTiebreakerColumnHeader,
  formatNhlSogTiebreakerColumnHeader,
  revealTiebreakerGuessForStandings,
} from "./nhl-tiebreaker-standings";

describe("NHL weekly tiebreaker standings visibility", () => {
  const nhlWeekly = { sport: "nhl", poolType: "pickem", pickFrequency: "weekly" };

  it("shows submitted guesses before the tiebreaker game starts", () => {
    assert.equal(revealTiebreakerGuessForStandings(nhlWeekly, 48, false), true);
    assert.equal(revealTiebreakerGuessForStandings(nhlWeekly, null, true), false);
  });

  it("keeps kickoff gate for non-NHL weekly pools", () => {
    const mlbWeekly = { sport: "mlb", poolType: "pickem", pickFrequency: "weekly" };
    assert.equal(revealTiebreakerGuessForStandings(mlbWeekly, 10, false), false);
    assert.equal(revealTiebreakerGuessForStandings(mlbWeekly, 10, true), true);
  });

  it("formats the standings column header with actual or TBD", () => {
    assert.equal(formatNhlSogTiebreakerColumnHeader("BUF", "TOR", 52), "BUF/TOR SOG (52)");
    assert.equal(formatNhlSogTiebreakerColumnHeader("BUF", "TOR", null), "BUF/TOR SOG (TBD)");
  });
});
