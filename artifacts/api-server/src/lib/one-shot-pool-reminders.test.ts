import assert from "node:assert/strict";
import test from "node:test";

import { reminderStageForDeadline } from "./pick-reminder-windows";
import { getGspLockState, GSP_GROUP_COUNT } from "./gsp-lock";

test("GSP tournament lock supports the standard 24h reminder window", () => {
  const lock = getGspLockState(2026, false, { now: new Date("2026-06-01T12:00:00.000Z") });
  assert.ok(lock.lockAt);
  assert.equal(lock.locked, false);
  const twentyThreeHoursBefore = new Date(lock.lockAt!.getTime() - 23 * 60 * 60 * 1000);
  assert.equal(reminderStageForDeadline(twentyThreeHoursBefore, lock.lockAt!), "24h");
});

test("GSP expects twelve group predictions before lock", () => {
  assert.equal(GSP_GROUP_COUNT, 12);
});

test("GSP sandbox pools have no external lock deadline", () => {
  const lock = getGspLockState(2026, true);
  assert.equal(lock.lockAt, null);
  assert.equal(lock.locked, false);
});
