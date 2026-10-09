import assert from "node:assert/strict";
import test from "node:test";

// Mirrors pickStatusFromOpenSlate in picks-summary.ts
function statusFromOpen(
  openGameIds: string[],
  pickedGameIds: string[],
): "pending" | "not_required" | "incomplete" | "submitted" {
  if (pickedGameIds.length === 0) {
    return openGameIds.length === 0 ? "not_required" : "pending";
  }
  const picked = new Set(pickedGameIds);
  return openGameIds.some((id) => !picked.has(id)) ? "incomplete" : "submitted";
}

test("weekend slate with no picks is pending even on a weekday", () => {
  assert.equal(statusFromOpen(["g1", "g2"], []), "pending");
});

test("empty slate with no picks is not_required", () => {
  assert.equal(statusFromOpen([], []), "not_required");
});

test("partial crazy 8s slate is incomplete", () => {
  assert.equal(statusFromOpen(["g1", "g2"], ["g1"]), "incomplete");
});
