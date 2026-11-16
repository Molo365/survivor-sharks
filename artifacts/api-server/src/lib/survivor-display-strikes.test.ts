import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countSurvivorGradedLossesExcludingVoidWeeks,
  survivorStrikeCountForDisplay,
} from "./survivor-display-strikes";

describe("survivor display strikes", () => {
  it("counts losses excluding void weeks", () => {
    const voided = new Set([2]);
    const picks = [
      { week: 1, result: "loss" },
      { week: 2, result: "loss" },
      { week: 3, result: "loss" },
      { week: 4, result: "win" },
    ];
    assert.equal(countSurvivorGradedLossesExcludingVoidWeeks(picks, voided), 2);
  });

  it("respects maxWeek for historical snapshots", () => {
    const voided = new Set<number>();
    const picks = [
      { week: 1, result: "loss" },
      { week: 2, result: "loss" },
    ];
    assert.equal(
      countSurvivorGradedLossesExcludingVoidWeeks(picks, voided, { maxWeek: 1 }),
      1,
    );
  });

  it("uses max of stored strikes and graded losses", () => {
    assert.equal(survivorStrikeCountForDisplay(2, 3, 3), 3);
    assert.equal(survivorStrikeCountForDisplay(2, 1, 3), 2);
    assert.equal(survivorStrikeCountForDisplay(0, 0, 3), 0);
    assert.equal(survivorStrikeCountForDisplay(1, 2, 2), 2);
  });
});