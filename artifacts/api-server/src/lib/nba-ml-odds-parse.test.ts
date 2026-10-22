import test from "node:test";
import assert from "node:assert/strict";
import { americanMoneylineToDecimal, parseEspnNbaMoneylines } from "./nba-ml-odds-parse";
import { NBA_SANDBOX_PLACEHOLDER_MONEYLINE } from "./nba-ml-odds";

test("americanMoneylineToDecimal", () => {
  assert.equal(americanMoneylineToDecimal(140), 2.4);
  assert.equal(americanMoneylineToDecimal(-165), 1 + 100 / 165);
  assert.equal(americanMoneylineToDecimal(-400), 1.25);
  assert.equal(americanMoneylineToDecimal(0), null);
});

test("parseEspnNbaMoneylines reads pickcenter", () => {
  const pair = parseEspnNbaMoneylines(
    {
      homeTeamOdds: { moneyLine: -150, teamId: "8" },
      awayTeamOdds: { moneyLine: 130, teamId: "2" },
    },
    "8",
    "2",
  );
  assert.ok(pair);
  assert.ok(pair!.homeDecimalOdds > 1 && pair!.homeDecimalOdds < 2);
  assert.ok(pair!.awayDecimalOdds > 2);
});

test("NBA sandbox placeholder moneylines are valid decimals", () => {
  assert.ok(NBA_SANDBOX_PLACEHOLDER_MONEYLINE.homeDecimalOdds >= 1);
  assert.ok(NBA_SANDBOX_PLACEHOLDER_MONEYLINE.awayDecimalOdds >= 1);
});
