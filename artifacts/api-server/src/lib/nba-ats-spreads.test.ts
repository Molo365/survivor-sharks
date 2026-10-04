import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNbaAtsSpread, parseEspnNbaSpread } from "./nba-ats-spread-parse";

test("normalizeNbaAtsSpread keeps half-points and bumps integers", () => {
  assert.equal(normalizeNbaAtsSpread(-1.5), 1.5);
  assert.equal(normalizeNbaAtsSpread(6.5), 6.5);
  assert.equal(normalizeNbaAtsSpread(-3), 3.5);
  assert.equal(normalizeNbaAtsSpread(0), null);
});

test("parseEspnNbaSpread reads favorite and absolute line", () => {
  const line = parseEspnNbaSpread(
    {
      spread: -1.5,
      homeTeamOdds: { favorite: true, teamId: "8" },
      awayTeamOdds: { favorite: false, teamId: "2" },
    },
    "8",
    "2",
  );
  assert.deepEqual(line, { spread: 1.5, favoriteTeamId: "8" });
});
