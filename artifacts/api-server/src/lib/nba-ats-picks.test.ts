import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NBA_ATS_MAX_PICKS,
  nbaAtsExceedsPickLimit,
  nbaAtsPickCountAfterMerge,
} from "./nba-ats-picks";

describe("nba-ats-picks", () => {
  it("caps at twelve merged picks", () => {
    assert.equal(NBA_ATS_MAX_PICKS, 12);
    const existing = Array.from({ length: 10 }, (_, i) => `g${i}`);
    assert.equal(nbaAtsPickCountAfterMerge(existing, ["g10", "g11"]), 12);
    assert.equal(nbaAtsExceedsPickLimit(existing, ["g10", "g11"]), false);
    assert.equal(nbaAtsExceedsPickLimit(existing, ["g10", "g11", "g12"]), true);
  });

  it("counts updates to the same game once", () => {
    assert.equal(nbaAtsPickCountAfterMerge(["g1", "g2"], ["g2", "g3"]), 3);
  });
});
