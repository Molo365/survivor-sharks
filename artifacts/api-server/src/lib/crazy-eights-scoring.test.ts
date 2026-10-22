import test from "node:test";
import assert from "node:assert/strict";
import { crazyEightsCorrectPickPoints } from "./crazy-eights-scoring";

test("crazyEightsCorrectPickPoints", () => {
  assert.equal(
    crazyEightsCorrectPickPoints("crazy_8s", { confidencePoints: 8, lockedDecimalOdds: null, result: "correct" }),
    8,
  );
  assert.equal(
    crazyEightsCorrectPickPoints("fast_break_multiplier", {
      confidencePoints: 8,
      lockedDecimalOdds: 2.5,
      result: "correct",
    }),
    20,
  );
  assert.equal(
    crazyEightsCorrectPickPoints("fast_break_multiplier", {
      confidencePoints: 8,
      lockedDecimalOdds: 2.5,
      result: "incorrect",
    }),
    0,
  );
});
