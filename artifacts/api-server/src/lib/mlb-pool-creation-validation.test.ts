import test from "node:test";
import assert from "node:assert/strict";
import { validateMlbPoolCreation } from "./mlb-pool-creation-validation";

test("blocks live MLB High Heat after regular season ends", async () => {
  const result = await validateMlbPoolCreation({
    sport: "mlb",
    poolType: "crazy_8s",
    sandboxMode: false,
    season: 2026,
    detectSeasonEnd: async () => true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /regular season is over/i);
  }
});

test("allows sandbox MLB pools after regular season ends", async () => {
  const result = await validateMlbPoolCreation({
    sport: "mlb",
    poolType: "crazy_8s",
    sandboxMode: true,
    season: 2026,
    detectSeasonEnd: async () => true,
  });
  assert.deepEqual(result, { ok: true, mlbPostseasonField: null });
});

test("ignores non-MLB sports", async () => {
  const result = await validateMlbPoolCreation({
    sport: "nhl",
    poolType: "crazy_8s",
    sandboxMode: false,
    season: 2026,
    detectSeasonEnd: async () => true,
  });
  assert.deepEqual(result, { ok: true, mlbPostseasonField: null });
});
