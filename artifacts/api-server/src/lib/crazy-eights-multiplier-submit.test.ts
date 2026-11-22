import assert from "node:assert/strict";
import test from "node:test";
import {
  multiplierMaxConfidenceValue,
  validateMultiplierChunkSubmit,
} from "./crazy-eights-multiplier-submit";
import { decideCrazyEightsSubmission } from "./crazy-eights-submission";

test("multiplierMaxConfidenceValue caps high confidence when games already started", () => {
  assert.equal(multiplierMaxConfidenceValue(0, 7), 7);
  assert.equal(multiplierMaxConfidenceValue(0, 8), 8);
  assert.equal(multiplierMaxConfidenceValue(2, 4), 6);
});

test("validateMultiplierChunkSubmit rejects confidence above remaining games", () => {
  assert.equal(
    validateMultiplierChunkSubmit({
      existingGameIds: new Set(),
      existingConfidence: new Set(),
      maxConfidenceValue: 7,
      newPicks: [{ gameId: "a", confidencePoints: 8 }],
    }),
    "Confidence points must be between 1 and 7 — only 7 games remain this weekend.",
  );
});

test("validateMultiplierChunkSubmit allows partial chunk with unused confidence", () => {
  const err = validateMultiplierChunkSubmit({
    existingGameIds: new Set(["a", "b"]),
    existingConfidence: new Set([8, 5]),
    newPicks: [
      { gameId: "c", confidencePoints: 7 },
      { gameId: "d", confidencePoints: 3 },
    ],
  });
  assert.equal(err, null);
});

test("validateMultiplierChunkSubmit rejects reusing confidence or games", () => {
  assert.equal(
    validateMultiplierChunkSubmit({
      existingGameIds: new Set(["a"]),
      existingConfidence: new Set([8]),
      newPicks: [{ gameId: "a", confidencePoints: 7 }],
    }),
    "One or more games were already submitted and are locked.",
  );
  assert.equal(
    validateMultiplierChunkSubmit({
      existingGameIds: new Set(["a"]),
      existingConfidence: new Set([8]),
      newPicks: [{ gameId: "b", confidencePoints: 8 }],
    }),
    "Confidence 8 is already used on a locked pick.",
  );
});

test("decideCrazyEightsSubmission allows incremental until 8", () => {
  assert.equal(
    decideCrazyEightsSubmission({ sandbox: false, existingPickCount: 4, incremental: true }),
    "allow",
  );
  assert.equal(
    decideCrazyEightsSubmission({ sandbox: false, existingPickCount: 8, incremental: true }),
    "refuse",
  );
});
