import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveNhlWeeklySundayPickRequiresTiebreaker } from "./nhl-weekly-tiebreaker-submit";

describe("liveNhlWeeklySundayPickRequiresTiebreaker", () => {
  it("requires SOG when submitting Sunday without entry guess", () => {
    assert.equal(
      liveNhlWeeklySundayPickRequiresTiebreaker({
        isLiveNhlWeekly: true,
        submitsSundayPick: true,
        entryTiebreakerShotsOnGoal: null,
        requestTiebreakerShotsOnGoal: undefined,
      }),
      true,
    );
  });

  it("allows Sunday submit when SOG is in the request", () => {
    assert.equal(
      liveNhlWeeklySundayPickRequiresTiebreaker({
        isLiveNhlWeekly: true,
        submitsSundayPick: true,
        entryTiebreakerShotsOnGoal: null,
        requestTiebreakerShotsOnGoal: 52,
      }),
      false,
    );
  });

  it("allows Saturday-only submit without SOG", () => {
    assert.equal(
      liveNhlWeeklySundayPickRequiresTiebreaker({
        isLiveNhlWeekly: true,
        submitsSundayPick: false,
        entryTiebreakerShotsOnGoal: null,
        requestTiebreakerShotsOnGoal: undefined,
      }),
      false,
    );
  });
});
