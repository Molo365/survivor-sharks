import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nhlSaturdaySevenPmLockActive,
  nhlWeekendPoolGameSubmissionLocked,
  nhlWeekendPoolOpponentPickRevealed,
  nhlWeekendPoolTiebreakerGuessRevealed,
  primaryNhlSaturdayEtDate,
} from "./nhl-slate-reveal";

describe("nhl-slate-reveal", () => {
  const pool = { sport: "nhl", poolType: "pickem", pickFrequency: "weekly", sandboxMode: false };

  it("picks primary Saturday ET date from slate kickoffs", () => {
    const sat = "2026-01-10T17:00:00.000Z";
    const sun = "2026-01-11T22:00:00.000Z";
    assert.equal(primaryNhlSaturdayEtDate([sat, sun]), "2026-01-10");
  });

  it("locks unstarted games at Saturday 7 PM ET", () => {
    const slate = ["2026-01-10T17:00:00.000Z", "2026-01-11T22:00:00.000Z"];
    const beforeLock = new Date("2026-01-10T23:30:00.000Z").getTime(); // 6:30 PM ET
    const afterLock = new Date("2026-01-11T00:30:00.000Z").getTime(); // 7:30 PM ET
    assert.equal(nhlSaturdaySevenPmLockActive(slate, beforeLock), false);
    assert.equal(nhlSaturdaySevenPmLockActive(slate, afterLock), true);
    assert.equal(
      nhlWeekendPoolGameSubmissionLocked({
        pool,
        gameStartIso: "2026-01-11T22:00:00.000Z",
        slateGameStartIsos: slate,
        nowMs: afterLock,
      }),
      true,
    );
  });

  it("reveals opponent picks and tiebreaker guesses at pool lock", () => {
    const slate = ["2026-01-10T17:00:00.000Z", "2026-01-11T22:00:00.000Z"];
    const afterLock = new Date("2026-01-11T00:30:00.000Z").getTime();
    assert.equal(
      nhlWeekendPoolOpponentPickRevealed({
        pool,
        isOwnPick: false,
        result: "pending",
        gameStartIso: "2026-01-11T22:00:00.000Z",
        slateGameStartIsos: slate,
        nowMs: afterLock,
      }),
      true,
    );
    assert.equal(
      nhlWeekendPoolTiebreakerGuessRevealed({
        pool,
        requesterUserId: 1,
        rowUserId: 2,
        slateGameStartIsos: slate,
        nowMs: afterLock,
      }),
      true,
    );
  });
});
