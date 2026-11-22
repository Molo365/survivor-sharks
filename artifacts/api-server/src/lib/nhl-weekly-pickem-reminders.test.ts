import assert from "node:assert/strict";
import test from "node:test";

import { reminderStageForDeadline } from "./pick-reminder-windows";
import { nhlSaturdaySevenPmLockInstant } from "./nhl-slate-reveal";

test("NHL weekly pick'em reminders use Saturday 7 PM ET, not Sunday puck drops", () => {
  const saturdayEt = "2025-11-22";
  const lockAt = nhlSaturdaySevenPmLockInstant(
    [
      "2025-11-22T22:00:00.000Z", // Sat game
      "2025-11-23T22:00:00.000Z", // Sun game (would wrongly drive a late-Sat email if used)
    ],
    saturdayEt,
  );
  assert.ok(lockAt);

  const twentyThreeHoursBefore = new Date(lockAt.getTime() - 23 * 60 * 60 * 1000);
  const afterLock = new Date(lockAt.getTime() + 2 * 60 * 60 * 1000);

  assert.equal(reminderStageForDeadline(twentyThreeHoursBefore, lockAt), "24h");
  assert.equal(reminderStageForDeadline(afterLock, lockAt), null);
});