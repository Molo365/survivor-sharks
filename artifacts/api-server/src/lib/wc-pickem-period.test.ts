import assert from "node:assert/strict";
import test from "node:test";

import { getWcPhase, wcGameToEspnGame, type WcGame } from "./wc";

test("getWcPhase covers group and knockout windows only", () => {
  assert.equal(getWcPhase("2026-06-10"), null);
  assert.equal(getWcPhase("2026-06-11"), "group_stage");
  assert.equal(getWcPhase("2026-06-27"), "group_stage");
  assert.equal(getWcPhase("2026-06-28"), null);
  assert.equal(getWcPhase("2026-07-03"), "knockout_stage");
  assert.equal(getWcPhase("2026-07-19"), "knockout_stage");
  assert.equal(getWcPhase("2026-07-20"), null);
});

test("wcGameToEspnGame preserves kickoff lock fields for reminders", () => {
  const wc: WcGame = {
    id: "wc2026_2026-06-11_usa_mex",
    date: "2026-06-12T02:00:00.000Z",
    status: "scheduled",
    homeTeam: { id: "usa", displayName: "USA", abbreviation: "USA", logo: null },
    awayTeam: { id: "mex", displayName: "Mexico", abbreviation: "MEX", logo: "https://example.com/mex.png" },
    homeScore: null,
    awayScore: null,
    groupLabel: "Group A",
    liveDetail: null,
    isCompleted: false,
    hasStarted: false,
  };
  const espn = wcGameToEspnGame(wc);
  assert.equal(espn.id, wc.id);
  assert.equal(espn.date, wc.date);
  assert.equal(espn.groupLabel, "Group A");
  assert.equal(espn.hasStarted, false);
  assert.equal(espn.awayTeam.logo, "https://example.com/mex.png");
});
