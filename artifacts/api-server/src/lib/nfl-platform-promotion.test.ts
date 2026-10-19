import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { etWallClockToUtc } from "./nfl-slate-reveal";
import { nflPlatformNextPeriodOpensAt } from "./nfl-platform-promotion";
import type { EspnGame } from "./espn";

function finalNflGame(overrides: Partial<EspnGame> & { weekNumber: number; date: string }): EspnGame {
  return {
    id: overrides.id ?? overrides.date,
    date: overrides.date,
    status: "final",
    isCompleted: true,
    isPostponed: false,
    hasStarted: true,
    seasonType: 2,
    seasonYear: 2026,
    weekNumber: overrides.weekNumber,
    homeTeam: { id: "h", displayName: "Home", abbreviation: "HOM", logo: null },
    awayTeam: { id: "a", displayName: "Away", abbreviation: "AWY", logo: null },
    homeScore: 21,
    awayScore: 14,
    homeRecord: null,
    awayRecord: null,
    liveState: null,
    homeStartingPitcher: null,
    awayStartingPitcher: null,
    ...overrides,
  } as EspnGame;
}

describe("nfl platform promotion", () => {
  it("returns nextPeriodOpensAt when the slate is final but before Tuesday 6 AM ET", () => {
    const pool = {
      poolType: "pickem_season",
      currentWeek: 7,
      season: 2026,
      isPreseason: false,
    };
    const games = [
      finalNflGame({ weekNumber: 7, date: "2026-10-18T17:00:00.000Z" }),
      finalNflGame({ weekNumber: 7, date: "2026-10-21T00:30:00.000Z" }),
    ];
    const mondayNight = new Date("2026-10-20T23:00:00-04:00");
    const opensAt = nflPlatformNextPeriodOpensAt(pool, games, mondayNight);
    // MNF ends Monday Oct 20 ET → next Tuesday promotion is Oct 27, 2026.
    assert.equal(opensAt, etWallClockToUtc("2026-10-27", 6, 0).toISOString());
  });

  it("returns null after the promotion window opens", () => {
    const pool = {
      poolType: "season",
      currentWeek: 7,
      season: 2026,
      isPreseason: false,
    };
    const games = [finalNflGame({ weekNumber: 7, date: "2026-10-21T00:30:00.000Z" })];
    const tuesdayMorning = new Date("2026-10-27T06:00:00-04:00");
    assert.equal(nflPlatformNextPeriodOpensAt(pool, games, tuesdayMorning), null);
  });
});
