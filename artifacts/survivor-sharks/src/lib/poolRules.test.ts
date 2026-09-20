import assert from "node:assert/strict";
import test from "node:test";
import { getPoolRules } from "./poolRules";

test("returns rules for NFL Survivor Season", () => {
  const rules = getPoolRules({ poolType: "season", sport: "nfl" });
  assert.ok(rules);
  assert.equal(rules.title, "NFL Survivor Season Rules");
  assert.equal(rules.sections.length, 5);
});

test("returns rules for NFL Pick-Ems Season", () => {
  const rules = getPoolRules({ poolType: "pickem_season", sport: "nfl" });
  assert.ok(rules);
  assert.equal(rules.title, "NFL Pick-Ems Season Rules");
  assert.equal(rules.sections.length, 5);
});

test("does not show rules for unsupported pools", () => {
  assert.equal(getPoolRules({ poolType: "pickem", sport: "nhl" }), null);
});