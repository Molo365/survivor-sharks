import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  etWallClockToUtc,
  isNflOfficePool,
  nflSundayOnePmRevealActive,
  nflOfficePoolOpponentPickRevealed,
  primaryNflSundayEtDate,
} from "./nfl-slate-reveal";

describe("isNflOfficePool", () => {
  it("includes NFL pools except division predictor", () => {
    assert.equal(isNflOfficePool({ sport: "nfl", poolType: "season" }), true);
    assert.equal(isNflOfficePool({ sport: "nfl", poolType: "nfl_division_predictor" }), false);
  });
});

describe("primaryNflSundayEtDate", () => {
  it("picks the Sunday with the most games", () => {
    const slate = [
      "2025-09-07T17:00:00Z",
      "2025-09-07T20:00:00Z",
      "2025-09-08T00:15:00Z",
      "2025-09-04T00:20:00Z",
    ];
    assert.equal(primaryNflSundayEtDate(slate), "2025-09-07");
  });
});

describe("nflSundayOnePmRevealActive", () => {
  it("is false before 1 PM ET on primary Sunday", () => {
    const slate = ["2025-09-07T17:00:00Z"];
    const before = etWallClockToUtc("2025-09-07", 12, 59).getTime();
    assert.equal(nflSundayOnePmRevealActive(slate, before), false);
  });

  it("is true at 1 PM ET on primary Sunday", () => {
    const slate = ["2025-09-07T17:00:00Z"];
    const atOne = etWallClockToUtc("2025-09-07", 13, 0).getTime();
    assert.equal(nflSundayOnePmRevealActive(slate, atOne), true);
  });
});

describe("nflOfficePoolOpponentPickRevealed", () => {
  const pool = { sport: "nfl", poolType: "nfl_confidence", sandboxMode: false };
  const mnf = "2025-09-09T00:15:00Z";
  const sundayGames = ["2025-09-07T17:00:00Z", mnf];

  it("reveals MNF before kickoff after Sunday 1 PM ET", () => {
    const now = etWallClockToUtc("2025-09-07", 14, 0).getTime();
    assert.equal(
      nflOfficePoolOpponentPickRevealed({
        pool,
        isOwnPick: false,
        result: "pending",
        gameStartIso: mnf,
        slateGameStartIsos: sundayGames,
        nowMs: now,
      }),
      true,
    );
  });

  it("keeps division predictor on kickoff", () => {
    const ndp = { sport: "nfl", poolType: "nfl_division_predictor", sandboxMode: false };
    const now = etWallClockToUtc("2025-09-07", 14, 0).getTime();
    assert.equal(
      nflOfficePoolOpponentPickRevealed({
        pool: ndp,
        isOwnPick: false,
        result: "pending",
        gameStartIso: mnf,
        slateGameStartIsos: sundayGames,
        nowMs: now,
      }),
      false,
    );
  });
});
