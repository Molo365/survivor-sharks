import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePickEmLivePickCell, countPickEmLiveProvisionalCorrect, type PickEmLiveGame } from "./pickEmLivePickCell";

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

  it("grades live 3-way draw pick as winning when level", () => {
    const game: PickEmLiveGame = {
      id: "2",
      startTime: "2026-11-04T20:00:00Z",
      status: "in_progress",
      awayScore: 1,
      homeScore: 1,
      awayTeam: { id: "a", abbreviation: "RMA" },
      homeTeam: { id: "h", abbreviation: "LIV" },
    };
    const pick = {
      gameId: "2",
      pickedTeamId: "draw",
      pickedTeamName: "Draw",
      result: "pending" as const,
    };
    const { state, abbr } = resolvePickEmLivePickCell(pick, game, {
      entryUserId: 1,
      currentUserId: 1,
      scoringMode: "three_way",
    });
    assert.equal(state, "live_winning");
    assert.equal(abbr, "D");
  });

  it("grades live 3-way home win pick as losing when away leads", () => {
    const game: PickEmLiveGame = {
      id: "3",
      startTime: "2026-11-04T20:00:00Z",
      status: "in_progress",
      awayScore: 2,
      homeScore: 0,
      awayTeam: { id: "a", abbreviation: "BAR" },
      homeTeam: { id: "h", abbreviation: "PSG" },
    };
    const pick = {
      gameId: "3",
      pickedTeamId: "home_win",
      pickedTeamName: "Home Win",
      result: "pending" as const,
    };
    const { state } = resolvePickEmLivePickCell(pick, game, {
      entryUserId: 1,
      currentUserId: 1,
      scoringMode: "three_way",
    });
    assert.equal(state, "live_losing");
  });

  it("counts provisional live winners", () => {
    const game: PickEmLiveGame = {
      id: "4",
      startTime: "2026-11-04T20:00:00Z",
      status: "in_progress",
      awayScore: 0,
      homeScore: 2,
      awayTeam: { id: "a", abbreviation: "VFB" },
      homeTeam: { id: "h", abbreviation: "GAL" },
    };
    const picks = [
      {
        gameId: "4",
        pickedTeamId: "h",
        pickedTeamName: "Galatasaray",
        result: "pending" as const,
      },
    ];
    const n = countPickEmLiveProvisionalCorrect(picks, [game], {
      entryUserId: 1,
      currentUserId: 1,
      scoringMode: "straight",
    });
    assert.equal(n, 1);
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
