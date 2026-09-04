import assert from "node:assert/strict";
import test from "node:test";

import { canStartReminderPass, incompleteEligibleUserIds, isReminderEligiblePool, reminderDeliveryState, reminderPeriodKey, reminderStageForDeadline, reminderTimingFromGames, shouldClaimReminder } from "./pick-reminder-windows";

test("reminder windows are mutually exclusive at their boundaries", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const deadlineIn = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);
  assert.equal(reminderStageForDeadline(now, deadlineIn(24)), "24h");
  assert.equal(reminderStageForDeadline(now, deadlineIn(3.01)), "24h");
  assert.equal(reminderStageForDeadline(now, deadlineIn(3)), "final");
  assert.equal(reminderStageForDeadline(now, deadlineIn(2)), "final");
  assert.equal(reminderStageForDeadline(now, deadlineIn(24.01)), null);
  assert.equal(reminderStageForDeadline(now, deadlineIn(1.99)), null);
});

test("period keys distinguish daily dates, calendar ranges, and NFL reset cycles", () => {
  assert.equal(reminderPeriodKey({ daily: true, date: "2026-06-01", week: 1 }), "2026-06-01");
  assert.equal(reminderPeriodKey({ start: "2026-06-01", end: "2026-06-07", week: 1 }), "2026-06-01/2026-06-07");
  assert.notEqual(reminderPeriodKey({ season: 2025, week: 1 }), reminderPeriodKey({ season: 2026, week: 1 }));
});

test("only scoped active recurring pools and incomplete eligible members are selected", () => {
  // These cover daily/weekly Pick-Em, survivor, both confidence variants, and NBA ATS;
  // sandbox mode does not change scope or eligibility decisions.
  for (const poolType of ["pickem", "season", "weekly", "mid_season", "dirty_dozen", "nfl_confidence", "nfl_confidence_weekly", "nba_ats"]) {
    assert.equal(isReminderEligiblePool({ poolType, isActive: true, isRecurring: true, sandboxMode: false }), true);
  }
  assert.equal(isReminderEligiblePool({ poolType: "mlb_bracket", isActive: true, isRecurring: true }), false);
  assert.equal(isReminderEligiblePool({ poolType: "pickem", isActive: false, isRecurring: true }), false);
  assert.equal(isReminderEligiblePool({ poolType: "pickem", isActive: true, isRecurring: false }), false);
  assert.equal(isReminderEligiblePool({ poolType: "pickem", isActive: true, isRecurring: true, sandboxMode: true }), false);
  assert.equal(isReminderEligiblePool({ poolType: "pickem", isActive: true, isRecurring: true, sandboxMode: true }, true), true);
  const members = [
    { id: 1, emailVerified: true, remindersEnabled: true, status: "alive" },
    { id: 2, emailVerified: true, remindersEnabled: true, status: "eliminated" },
    { id: 3, emailVerified: false, remindersEnabled: true, status: "alive" },
    { id: 4, emailVerified: true, remindersEnabled: false, status: "alive" },
    { id: 5, emailVerified: true, remindersEnabled: true, status: "alive" },
  ];
  assert.deepEqual(incompleteEligibleUserIds(members, new Set([5]), true), [1]);
  assert.deepEqual(incompleteEligibleUserIds(members, new Set([5]), false), [1, 2]);
});

test("claiming and terminal delivery states prevent duplicate sends and retries", () => {
  assert.equal(shouldClaimReminder(false), true);
  assert.equal(shouldClaimReminder(true), false);
  assert.deepEqual(reminderDeliveryState(), { status: "sent", lastError: null });
  assert.deepEqual(reminderDeliveryState(new Error("provider unavailable")), { status: "failed", lastError: "provider unavailable" });
  // A failed row exists just like a sent row, therefore neither may be reclaimed.
  assert.equal(shouldClaimReminder(true), false);
});

test("sandbox-shaped deadline fixtures preserve offsets and period identities", () => {
  const games = [{ date: "2025-09-07T17:00:00Z" }];
  const dailyPickem = reminderTimingFromGames({ kind: "pickem", daily: true, date: "2025-09-07", week: 1, games, dailyDeadline: new Date("2025-09-07T16:55:00Z") });
  const weeklyPickem = reminderTimingFromGames({ kind: "pickem", start: "2025-09-01", end: "2025-09-07", week: 1, games });
  const survivor = reminderTimingFromGames({ kind: "survivor", season: 2025, week: 1, games });
  const confidenceSeason = reminderTimingFromGames({ kind: "confidence", season: 2025, week: 1, games });
  const confidenceWeekly = reminderTimingFromGames({ kind: "confidence", season: 2025, week: 1, games });
  const nbaAts = reminderTimingFromGames({ kind: "pickem", start: "2025-09-05", end: "2025-09-07", season: 2025, week: 1, games });
  assert.equal(dailyPickem?.deadline.toISOString(), "2025-09-07T16:55:00.000Z");
  assert.equal(weeklyPickem?.deadline.toISOString(), "2025-09-07T16:55:00.000Z");
  assert.equal(survivor?.deadline.toISOString(), "2025-09-07T17:00:00.000Z");
  assert.equal(confidenceSeason?.deadline.toISOString(), "2025-09-07T17:00:00.000Z");
  assert.equal(confidenceWeekly?.periodKey, "2025-week-1");
  assert.equal(nbaAts?.periodKey, "2025-09-05/2025-09-07");
  assert.equal(reminderStageForDeadline(new Date("2025-09-07T13:00:00Z"), nbaAts!.deadline), "24h");
});

test("non-overlap/lock decision allows exactly one caller", () => {
  assert.equal(canStartReminderPass(false, true), true);
  assert.equal(canStartReminderPass(true, true), false);
  assert.equal(canStartReminderPass(false, false), false);
});