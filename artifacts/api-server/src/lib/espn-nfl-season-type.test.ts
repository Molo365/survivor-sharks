import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNflEspnSeasonType } from "./espn";

describe("resolveNflEspnSeasonType", () => {
  it("keeps preseason for weeks 1–4", () => {
    assert.equal(resolveNflEspnSeasonType(1, 1), 1);
    assert.equal(resolveNflEspnSeasonType(1, 4), 1);
  });

  it("uses regular season when a preseason pool is on week 5+", () => {
    assert.equal(resolveNflEspnSeasonType(1, 7), 2);
  });

  it("leaves regular-season requests unchanged", () => {
    assert.equal(resolveNflEspnSeasonType(2, 7), 2);
  });
});
