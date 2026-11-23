import assert from "node:assert/strict";
import test from "node:test";

import { isFastBreakMultiplierPool } from "./fast-break-pool";

test("isFastBreakMultiplierPool identifies NBA multiplier pools", () => {
  assert.equal(
    isFastBreakMultiplierPool({ poolType: "fast_break_multiplier", sport: "nba" }),
    true,
  );
  assert.equal(
    isFastBreakMultiplierPool({ poolType: "crazy_8s", sport: "nba" }),
    false,
  );
  assert.equal(
    isFastBreakMultiplierPool({ poolType: "fast_break_multiplier", sport: "nhl" }),
    false,
  );
});