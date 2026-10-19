import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nbaSundayOnePmLockActive,
  nbaWeekendPoolGameSubmissionLocked,
  nbaWeekendPoolOpponentPickRevealed,
  nbaWeekendPoolTiebreakerGuessRevealed,
} from "./nba-slate-reveal";

describe("nba-slate-reveal", () => {
  const pool = { sport: "nba", poolType: "nba_ats", sandboxMode: false };

  it("locks unstarted games at Sunday 1 PM ET", () => {
    const fri = "2026-01-09T00:30:00.000Z";
    const sun = "2026-01-11T22:00:00.000Z";
    const slate = [fri, sun];
    const beforeLock = new Date("2026-01-11T16:30:00.000Z").getTime(); // 11:30 AM ET
    const afterLock = new Date("2026-01-11T18:30:00.000Z").getTime(); // 1:30 PM ET
    assert.equal(nbaSundayOnePmLockActive(slate, beforeLock), false);
    assert.equal(nbaSundayOnePmLockActive(slate, afterLock), true);
    assert.equal(
      nbaWeekendPoolGameSubmissionLocked({
        pool,
        gameStartIso: sun,
        slateGameStartIsos: slate,
        nowMs: afterLock,
      }),
      true,
    );
  });

  it("reveals opponent picks and tiebreaker guesses at pool lock", () => {
    const slate = ["2026-01-09T00:30:00.000Z", "2026-01-11T22:00:00.000Z"];
    const afterLock = new Date("2026-01-11T18:30:00.000Z").getTime();
    assert.equal(
      nbaWeekendPoolOpponentPickRevealed({
        pool,
        isOwnPick: false,
        result: "pending",
        gameStartIso: slate[1],
        slateGameStartIsos: slate,
        nowMs: afterLock,
      }),
      true,
    );
    assert.equal(
      nbaWeekendPoolTiebreakerGuessRevealed({
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
