import test from "node:test";
import assert from "node:assert/strict";
import { mergeWeeklySoccerLeaderboardAggregates } from "./pickem-leaderboard-members";

test("mergeWeeklySoccerLeaderboardAggregates adds zero-pick members and sorts by score", () => {
  const merged = mergeWeeklySoccerLeaderboardAggregates(
    [
      {
        userId: 1,
        username: "alpha",
        displayName: "Alpha",
        correct: "2",
        picked: "3",
      },
    ],
    [
      { userId: 1, username: "alpha", displayName: "Alpha" },
      { userId: 2, username: "bravo", displayName: "Bravo" },
      { userId: 3, username: "charlie", displayName: null },
    ],
  );

  assert.equal(merged.length, 3);
  assert.equal(merged[0].userId, 1);
  assert.equal(Number(merged[1].correct), 0);
  assert.equal(Number(merged[2].correct), 0);
  assert.deepEqual(merged.slice(1).map((row) => row.userId).sort(), [2, 3]);
});
