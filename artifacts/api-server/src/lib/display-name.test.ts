import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDisplayName } from "./display-name";

test("trims and collapses runs of whitespace", () => {
  assert.deepEqual(normalizeDisplayName("  Loan   Shark \n"), {
    ok: true,
    value: "Loan Shark",
  });
});

test("rejects names shorter than three characters", () => {
  assert.equal(normalizeDisplayName("AB").ok, false);
});

test("rejects names longer than thirty characters", () => {
  assert.equal(normalizeDisplayName("A".repeat(31)).ok, false);
});

test("rejects angle brackets", () => {
  assert.equal(normalizeDisplayName("Loan <Shark").ok, false);
  assert.equal(normalizeDisplayName("Loan >Shark").ok, false);
});

test("rejects names without a letter or digit", () => {
  assert.equal(normalizeDisplayName("___").ok, false);
});

test("accepts names with letters from different alphabets", () => {
  assert.deepEqual(normalizeDisplayName("Loan Shark"), {
    ok: true,
    value: "Loan Shark",
  });
  assert.deepEqual(normalizeDisplayName("Kyser Söze"), {
    ok: true,
    value: "Kyser Söze",
  });
});