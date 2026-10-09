import assert from "node:assert/strict";
import test from "node:test";
import type { EspnGame } from "./espn";
import {
  applyGamesToTeamKickoffMap,
  survivorGridKickoffKey,
} from "./survivor-grid-kickoff";
import { nhlSurvivorSlateForSettlement } from "./nhl-survivor-slate";

test("applyGamesToTeamKickoffMap maps both teams to the same kickoff for that week", () => {
  const game = {
    id: "sat-vgk",
    date: "2026-01-03T18:00:00.000Z",
    homeTeam: { id: "vgk", name: "Golden Knights" },
    awayTeam: { id: "lak", name: "Kings" },
  } as EspnGame;

  const map = new Map<string, Date>();
  applyGamesToTeamKickoffMap(2, [game], map);

  assert.equal(map.get(survivorGridKickoffKey(2, "vgk"))?.toISOString(), game.date);
  assert.equal(map.get(survivorGridKickoffKey(2, "lak"))?.toISOString(), game.date);
  assert.equal(map.has(survivorGridKickoffKey(1, "vgk")), false);
});

test("week 1 kickoff does not satisfy week 2 lookup for the same team", () => {
  const map = new Map<string, Date>();
  const week1 = {
    id: "w1",
    date: "2026-01-03T18:00:00.000Z",
    homeTeam: { id: "fla", name: "Panthers" },
    awayTeam: { id: "tbl", name: "Lightning" },
  } as EspnGame;
  const week2 = {
    id: "w2",
    date: "2026-01-10T18:00:00.000Z",
    homeTeam: { id: "fla", name: "Panthers" },
    awayTeam: { id: "bos", name: "Bruins" },
  } as EspnGame;

  applyGamesToTeamKickoffMap(1, [week1], map);
  applyGamesToTeamKickoffMap(2, [week2], map);

  assert.equal(map.get(survivorGridKickoffKey(1, "fla"))?.toISOString(), week1.date);
  assert.equal(map.get(survivorGridKickoffKey(2, "fla"))?.toISOString(), week2.date);
});

test("NHL survivor settlement slate excludes Sunday games from kickoff lookup", () => {
  const saturday = { id: "sat", date: "2026-01-03T18:00:00.000Z" };
  const sunday = { id: "sun", date: "2026-01-04T18:00:00.000Z" };

  const slate = nhlSurvivorSlateForSettlement([saturday, sunday]);
  assert.deepEqual(slate.map((g) => g.id), ["sat"]);
});
