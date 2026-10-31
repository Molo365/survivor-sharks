import assert from "node:assert/strict";
import test from "node:test";

import {
  reminderStageBeforeFirstTip,
  reminderStageForDeadline,
} from "./pick-reminder-windows";
import { getNbaAtsPicksOpenInstant } from "./nba-ats-period";

test("NBA weekend pick reminder fires 3–5 hours before first tip, not on Saturday", () => {
  const firstTip = new Date("2025-10-31T23:00:00.000Z"); // 7 PM ET (approx)
  const fourHoursBefore = new Date(firstTip.getTime() - 4 * 60 * 60 * 1000);
  const saturdayLock = new Date("2025-11-01T22:00:00.000Z");

  assert.equal(reminderStageBeforeFirstTip(fourHoursBefore, firstTip), "24h");
  assert.equal(reminderStageForDeadline(fourHoursBefore, saturdayLock), null);
  assert.equal(reminderStageBeforeFirstTip(new Date(firstTip.getTime() - 2 * 60 * 60 * 1000), firstTip), null);
  assert.equal(reminderStageBeforeFirstTip(new Date(firstTip.getTime() - 6 * 60 * 60 * 1000), firstTip), null);
});

test("NBA weekend pick sheet opens Tuesday 6 AM ET before the Friday slate", () => {
  const friday = "2025-10-31";
  const open = getNbaAtsPicksOpenInstant(
    {
      sport: "nba",
      poolType: "nba_ats",
      initialPeriodStart: friday,
      createdAt: new Date("2025-10-01T12:00:00Z"),
      sandboxMode: false,
      currentWeek: 1,
    },
    new Date("2025-10-28T14:00:00.000Z"),
  );
  const mondayBefore = new Date("2025-10-27T15:00:00.000Z");
  assert.ok(open.getTime() > mondayBefore.getTime());
  assert.ok(open.getTime() <= new Date("2025-10-28T14:00:00.000Z").getTime());
});
