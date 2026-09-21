import assert from "node:assert/strict";
import test from "node:test";
import { decideCrazyEightsSubmission } from "./crazy-eights-submission";

test("allows a live submission when the current period has no picks", () => {
  assert.equal(decideCrazyEightsSubmission({ sandbox: false, existingPickCount: 0 }), "allow");
});

test("refuses a live submission when the current period already has picks", () => {
  assert.equal(decideCrazyEightsSubmission({ sandbox: false, existingPickCount: 1 }), "refuse");
});

test("always allows sandbox submissions", () => {
  assert.equal(decideCrazyEightsSubmission({ sandbox: true, existingPickCount: 0 }), "allow");
  assert.equal(decideCrazyEightsSubmission({ sandbox: true, existingPickCount: 8 }), "allow");
});