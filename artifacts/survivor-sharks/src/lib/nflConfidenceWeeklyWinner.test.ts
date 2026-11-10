import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNflConfidenceWeeklyWinnerDisplay } from "./nflConfidenceWeeklyWinner";

describe("resolveNflConfidenceWeeklyWinnerDisplay", () => {
  const graded = (week: number, username: string, pts: number) => ({
    week,
    actualPassingYards: 300,
    players: [{
      rank: 1,
      userId: 1,
      username,
      displayName: null,
      weekPoints: pts,
      gradedPicks: 14,
      totalPicks: 14,
      potSplit: false,
    }],
  });

  const empty = (week: number) => ({
    week,
    actualPassingYards: null,
    players: [],
  });

  it("shows current week when graded", () => {
    const result = resolveNflConfidenceWeeklyWinnerDisplay(
      10,
      graded(10, "alice", 80),
      graded(9, "bob", 68),
    );
    assert.equal(result.displayWeek, 10);
    assert.equal(result.winner?.username, "alice");
    assert.equal(result.isLastWeek, false);
  });

  it("falls back to previous week when current slate is empty", () => {
    const result = resolveNflConfidenceWeeklyWinnerDisplay(
      10,
      empty(10),
      graded(9, "stronzino", 68),
    );
    assert.equal(result.displayWeek, 9);
    assert.equal(result.winner?.username, "stronzino");
    assert.equal(result.isLastWeek, true);
  });
});
