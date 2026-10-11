import assert from "node:assert/strict";
import { test } from "node:test";
import {
  poolSupportsDoubleElimination,
  resolveStoredDoubleElimination,
} from "./pool-double-elimination";

test("double elimination only for NFL/MLB survivor pool types", () => {
  assert.equal(poolSupportsDoubleElimination("nfl", "season"), true);
  assert.equal(poolSupportsDoubleElimination("nfl", "weekly"), true);
  assert.equal(poolSupportsDoubleElimination("mlb", "season"), true);
  assert.equal(poolSupportsDoubleElimination("nfl", "pickem_season"), false);
  assert.equal(poolSupportsDoubleElimination("nfl", "nfl_confidence"), false);
  assert.equal(poolSupportsDoubleElimination("nhl", "season"), false);
  assert.equal(poolSupportsDoubleElimination("nfl", "crazy_8s"), false);
});

test("resolveStoredDoubleElimination ignores request for non-survivor pools", () => {
  assert.equal(resolveStoredDoubleElimination("nfl", "pickem_season", true), false);
  assert.equal(resolveStoredDoubleElimination("nfl", "season", true), true);
  assert.equal(resolveStoredDoubleElimination("nfl", "season", false), false);
});
