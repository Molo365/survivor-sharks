import assert from "node:assert/strict";
import test from "node:test";

import { nbaSaturdaySixPmLockInstant } from "./nba-slate-reveal";
import { reminderStageForDeadline, reminderTimingFromGames } from "./pick-reminder-windows";
import { getNbaAtsPicksOpenInstant } from "./nba-ats-period";

test("NBA ATS reminders anchor to Saturday 6 PM ET, not the first kickoff", () => {
  const thursdayKickoff = "2025-10-23T00:15:00.000Z";
  const saturdayEt = "2025-10-25";
  const slateIsos = [thursdayKickoff, "2025-10-26T02:00:00.000Z"];
  const poolLock = nbaSaturdaySixPmLockInstant(slateIsos, saturdayEt);
  const legacyFirstGame = reminderTimingFromGames({
    kind: "pickem",
    start: "2025-10-23",
    end: "2025-10-26",
    week: 1,
    games: [{ date: thursdayKickoff }],
  });
  assert.ok(poolLock);
  assert.ok(legacyFirstGame);
  assert.notEqual(poolLock!.toISOString(), legacyFirstGame!.deadline.toISOString());
  const wednesdayBeforeThursdayKick = new Date(new Date(thursdayKickoff).getTime() - 20 * 60 * 60 * 1000);
  assert.equal(
    reminderStageForDeadline(wednesdayBeforeThursdayKick, legacyFirstGame!.deadline),
    "24h",
  );
  assert.equal(reminderStageForDeadline(wednesdayBeforeThursdayKick, poolLock!), null);
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
