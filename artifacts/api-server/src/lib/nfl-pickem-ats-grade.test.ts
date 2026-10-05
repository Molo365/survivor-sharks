import test from "node:test";
import assert from "node:assert/strict";
import { gradeNflPickemAtsPick, gradeNflPickemStraightPick } from "./nfl-pickem-ats-cover";
import { normalizeNflPickemAtsSpread, parseEspnNflSpread } from "./nfl-pickem-ats-spread-parse";

test("normalizeNflPickemAtsSpread bumps integer spreads", () => {
  assert.equal(normalizeNflPickemAtsSpread(-4), 4.5);
  assert.equal(normalizeNflPickemAtsSpread(3.5), 3.5);
});

test("parseEspnNflSpread reads favorite and absolute line", () => {
  const line = parseEspnNflSpread(
    {
      spread: -4,
      homeTeamOdds: { favorite: false, teamId: "21" },
      awayTeamOdds: { favorite: true, teamId: "6" },
    },
    "21",
    "6",
  );
  assert.deepEqual(line, { spread: 4.5, favoriteTeamId: "6" });
});

test("gradeNflPickemAtsPick — favorite covers", () => {
  assert.equal(
    gradeNflPickemAtsPick({
      pickedTeamId: "6",
      favoriteTeamId: "6",
      spread: 4.5,
      homeScore: 10,
      awayScore: 20,
      homeTeamId: "21",
    }),
    "correct",
  );
});

test("gradeNflPickemAtsPick — underdog covers", () => {
  assert.equal(
    gradeNflPickemAtsPick({
      pickedTeamId: "21",
      favoriteTeamId: "6",
      spread: 4.5,
      homeScore: 17,
      awayScore: 20,
      homeTeamId: "21",
    }),
    "correct",
  );
});

test("gradeNflPickemStraightPick — tie is push", () => {
  assert.equal(
    gradeNflPickemStraightPick({
      pickedTeamId: "1",
      homeScore: 14,
      awayScore: 14,
      homeTeamId: "1",
      awayTeamId: "2",
    }),
    "push",
  );
});
