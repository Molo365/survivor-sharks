import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderedUnsettledSurvivorWeeksFromPicks } from "./survivor-week-settlement";

describe("orderedUnsettledSurvivorWeeksFromPicks", () => {
  it("returns unsettled weeks in ascending order", () => {
    assert.deepEqual(
      orderedUnsettledSurvivorWeeksFromPicks([8, 8, 7, 9], new Set([7])),
      [8, 9],
    );
  });

  it("returns empty when every pick week is finalized", () => {
    assert.deepEqual(
      orderedUnsettledSurvivorWeeksFromPicks([3, 4], new Set([3, 4])),
      [],
    );
  });
});