import assert from "node:assert/strict";
import test from "node:test";

import { etWallClockToUtc, primaryNflSundayEtDate } from "./nfl-slate-reveal";
import {
  isNflOfficeWeeklyReminderPool,
  nflOfficeConfidenceReminderRequiredGameIds,
  reminderStageBeforeNflSundayOfficeLock,
} from "./nfl-office-pick-reminders";

test("NFL office weekly reminder pools exclude division predictor and sandbox", () => {
  assert.equal(isNflOfficeWeeklyReminderPool({ sport: "nfl", poolType: "weekly", sandboxMode: false, pickFrequency: "weekly" }), true);
  assert.equal(isNflOfficeWeeklyReminderPool({ sport: "nfl", poolType: "pickem_season", sandboxMode: false, pickFrequency: "weekly" }), true);
  assert.equal(isNflOfficeWeeklyReminderPool({ sport: "nfl", poolType: "nfl_division_predictor", sandboxMode: false, pickFrequency: "weekly" }), false);
  assert.equal(isNflOfficeWeeklyReminderPool({ sport: "nfl", poolType: "weekly", sandboxMode: true, pickFrequency: "weekly" }), false);
});

test("Sunday office-lock reminder fires about two hours before 1 PM ET", () => {
  const sunday = primaryNflSundayEtDate([
    "2025-09-07T17:00:00.000Z",
    "2025-09-07T20:25:00.000Z",
  ]);
  assert.equal(sunday, "2025-09-07");
  const lockAt = etWallClockToUtc(sunday!, 13, 0);
  const twoHoursBefore = new Date(lockAt.getTime() - 2 * 60 * 60 * 1000);
  assert.equal(reminderStageBeforeNflSundayOfficeLock(twoHoursBefore, lockAt), "24h");
  assert.equal(reminderStageBeforeNflSundayOfficeLock(new Date(lockAt.getTime() - 60 * 60 * 1000), lockAt), null);
});

test("confidence weekly Sunday lock reminders only require still-open games", () => {
  const pool = { sport: "nfl", poolType: "nfl_confidence_weekly", sandboxMode: false };
  const sunday = "2025-11-02";
  const lockAt = etWallClockToUtc(sunday, 13, 0);
  const nowMs = lockAt.getTime() - 2 * 60 * 60 * 1000;
  const games = [
    { id: "thu", date: "2025-10-30T00:15:00.000Z" },
    { id: "sun-a", date: "2025-11-02T18:00:00.000Z" },
    { id: "sun-b", date: "2025-11-02T21:25:00.000Z" },
  ] as Parameters<typeof nflOfficeConfidenceReminderRequiredGameIds>[1];
  const required = nflOfficeConfidenceReminderRequiredGameIds(pool, games, nowMs);
  assert.equal(required.has("thu"), false);
  assert.deepEqual([...required].sort(), ["sun-a", "sun-b"]);
  const userPickIds = new Set(["sun-a", "sun-b"]);
  assert.ok([...required].every((id) => userPickIds.has(id)));
});
