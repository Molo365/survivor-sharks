import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePickEmLivePickCell, type PickEmLiveGame } from "./pickEmLivePickCell";

const baseGame: PickEmLiveGame = {
  id: "1",
  startTime: "2026-10-24T23:00:00Z",
  status: "in_progress",
  awayScore: 98,
  homeScore: 102,
  awayTeam: { id: "away", abbreviation: "NY" },
  homeTeam: { id: "home", abbreviation: "BOS" },
  spread: 4.5,
  favoriteTeamId: "home",
};

describe("resolvePickEmLivePickCell ATS", () => {
  it("grades live underdog cover as winning", () => {
    const pick = {
      gameId: "1",
      pickedTeamId: "away",
      pickedTeamName: "Knicks",
      result: "pending" as const,
    };
    const { state } = resolvePickEmLivePickCell(pick, baseGame, {
      entryUserId: 1,
      currentUserId: 1,
      scoringMode: "ats",
    });
    assert.equal(state, "live_winning");
  });

  it("grades live favorite not covering as losing", () => {
    const pick = {
      gameId: "1",
      pickedTeamId: "home",
      pickedTeamName: "Celtics",
      result: "pending" as const,
    };
    const { state } = resolvePickEmLivePickCell(pick, baseGame, {
      entryUserId: 1,
      currentUserId: 1,
      scoringMode: "ats",
    });
    assert.equal(state, "live_losing");
  });
});
