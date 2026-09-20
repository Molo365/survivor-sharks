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

test("returns rules for NHL Weekend Pick-Ems", () => {
  const rules = getPoolRules({ poolType: "pickem", sport: "nhl", pickFrequency: "weekly" });
  assert.ok(rules);
  assert.equal(rules.title, "NHL Weekend Pick-Ems Rules");
  assert.equal(rules.sections.length, 5);
});

test("returns rules for NHL Survivor Season", () => {
  const rules = getPoolRules({ poolType: "season", sport: "nhl" });
  assert.ok(rules);
  assert.equal(rules.title, "NHL Survivor Season Rules");
  assert.equal(rules.sections.length, 5);
});

test("keeps NHL daily Pick-Em without rules", () => {
  assert.equal(getPoolRules({ poolType: "pickem", sport: "nhl", pickFrequency: "daily" }), null);
});

test("keeps MLB Pick-Em without rules", () => {
  assert.equal(getPoolRules({ poolType: "pickem", sport: "mlb", pickFrequency: "weekly" }), null);
});

test("keeps the NFL rules unchanged", () => {
  const survivor = getPoolRules({ poolType: "season", sport: "nfl" });
  const pickEm = getPoolRules({ poolType: "pickem_season", sport: "nfl" });

  assert.equal(survivor?.title, "NFL Survivor Season Rules");
  assert.equal(survivor?.sections.length, 5);
  assert.equal(pickEm?.title, "NFL Pick-Ems Season Rules");
  assert.equal(pickEm?.sections.length, 5);
});