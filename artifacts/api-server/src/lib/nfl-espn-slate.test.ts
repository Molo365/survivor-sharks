import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNflEspnSeasonType } from "./nfl-espn-slate";

describe("resolveNflEspnSeasonType", () => {
  it("uses preseason only for weeks 1–4 when pool is preseason", () => {
    assert.equal(resolveNflEspnSeasonType({ season: 2026, isPreseason: true }, 3), 1);
    assert.equal(resolveNflEspnSeasonType({ season: 2026, isPreseason: true }, 7), 2);
  });

  it("uses regular season for non-preseason pools", () => {
    assert.equal(resolveNflEspnSeasonType({ season: 2026, isPreseason: false }, 7), 2);
  });
});
