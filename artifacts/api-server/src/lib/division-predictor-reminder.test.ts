import assert from "node:assert/strict";
import test from "node:test";

import { reminderStageForDeadline } from "./pick-reminder-windows";
import {
  requiredDivisionPickCount,
  resolveDivisionPredictorReminderDeadline,
} from "./division-predictor-reminder";
import { clearNdpLockCacheForTests } from "./ndp-lock";
import { clearNhlNdpLockCacheForTests } from "./nhl-ndp-lock";

test("division predictor reminder uses season lock and standard 24h window", async () => {
  clearNdpLockCacheForTests();
  const pool = {
    poolType: "nfl_division_predictor",
    season: 2026,
    sandboxMode: false,
    currentWeek: 1,
  } as const;

  const resolved = await resolveDivisionPredictorReminderDeadline(
    pool as Parameters<typeof resolveDivisionPredictorReminderDeadline>[0],
    new Date("2026-06-01T12:00:00.000Z"),
  );
  assert.ok(resolved?.deadline);
  assert.ok(resolved!.deadline.getTime() > Date.parse("2026-06-01T12:00:00.000Z"));

  const twentyThreeHoursBefore = new Date(resolved!.deadline.getTime() - 23 * 60 * 60 * 1000);
  assert.equal(reminderStageForDeadline(twentyThreeHoursBefore, resolved!.deadline), "24h");
  assert.equal(reminderStageForDeadline(new Date(resolved!.deadline.getTime() - 25 * 60 * 60 * 1000), resolved!.deadline), null);
});

test("division predictor reminders stop after lock and in sandbox", async () => {
  clearNhlNdpLockCacheForTests();
  const pool = {
    poolType: "nhl_division_predictor",
    season: 2026,
    sandboxMode: false,
    currentWeek: 1,
  } as const;

  const afterLock = await resolveDivisionPredictorReminderDeadline(
    pool as Parameters<typeof resolveDivisionPredictorReminderDeadline>[0],
    new Date("2030-01-01T00:00:00.000Z"),
  );
  assert.equal(afterLock, null);

  const sandbox = await resolveDivisionPredictorReminderDeadline({
    ...pool,
    sandboxMode: true,
  } as Parameters<typeof resolveDivisionPredictorReminderDeadline>[0]);
  assert.equal(sandbox, null);
});

test("required division pick counts match product slates", () => {
  assert.equal(requiredDivisionPickCount("nfl_division_predictor"), 8);
  assert.equal(requiredDivisionPickCount("nhl_division_predictor"), 4);
});
