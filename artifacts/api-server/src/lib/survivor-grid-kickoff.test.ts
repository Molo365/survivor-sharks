import assert from "node:assert/strict";
import test from "node:test";
import type { EspnGame } from "./espn";
import { applyGamesToTeamKickoffMap } from "./survivor-grid-kickoff";
import { nhlSurvivorSlateForSettlement } from "./nhl-survivor-slate";

test("applyGamesToTeamKickoffMap maps both teams to the same kickoff", () => {
  const game = {
    id: "sat-vgk",
    date: "2026-01-03T18:00:00.000Z",
    homeTeam: { id: "vgk", name: "Golden Knights" },
    awayTeam: { id: "lak", name: "Kings" },
  } as EspnGame;

  const map = new Map<string, Date>();
  applyGamesToTeamKickoffMap([game], map);

  assert.equal(map.get("vgk")?.toISOString(), game.date);
  assert.equal(map.get("lak")?.toISOString(), game.date);
});

test("NHL survivor settlement slate excludes Sunday games from kickoff lookup", () => {
  const saturday = { id: "sat", date: "2026-01-03T18:00:00.000Z" };
  const sunday = { id: "sun", date: "2026-01-04T18:00:00.000Z" };

  const slate = nhlSurvivorSlateForSettlement([saturday, sunday]);
  assert.deepEqual(slate.map((g) => g.id), ["sat"]);
});
