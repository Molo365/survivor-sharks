import assert from "node:assert/strict";
import test from "node:test";
import { getPoolRules } from "./poolRules";

test("returns rules for NFL Survivor Season", () => {
  const rules = getPoolRules({ poolType: "season", sport: "nfl" });
  assert.ok(rules);
  assert.equal(rules.title, "NFL Survivor Season Rules");
  assert.equal(rules.sections.length, 5);
});

test("returns rules for NFL Pick-Ems Season", () => {
  const rules = getPoolRules({ poolType: "pickem_season", sport: "nfl" });
  assert.ok(rules);
  assert.equal(rules.title, "NFL Pick-Ems Season Rules");
  assert.equal(rules.sections.length, 5);
});

test("returns rules for NHL Weekend Pick-Ems", () => {
  const rules = getPoolRules({ poolType: "pickem", sport: "nhl", pickFrequency: "weekly" });
  assert.ok(rules);
  assert.equal(rules.title, "NHL Weekend Pick-Ems Rules");
  assert.equal(rules.sections.length, 5);
});

test("returns NHL Hit the Ice rules with weekend days and tiebreakers", () => {
  const rules = getPoolRules({
    poolType: "crazy_8s",
    sport: "nhl",
    prizeStructure: [{ place: 1, amount: 100 }],
  });
  assert.ok(rules);
  assert.equal(rules.title, "NHL Hit the Ice Rules");
  assert.equal(rules.sections.length, 6);

  const sections = new Map(rules.sections.map((section) => [section.heading, section.items]));
  assert.ok(sections.get("How it works")?.[0].includes("Saturday and Sunday"));
  assert.ok(sections.get("Tiebreakers")?.[0].includes("shots on goal"));
  assert.ok(sections.get("Tiebreakers")?.[0].includes("penalty minutes"));
  assert.ok(sections.get("Every weekend")?.some((item) => item.includes("repeats every weekend")));
  assert.ok(sections.get("Prizes")?.some((item) => item.includes("Prizes are worked out for each weekend.")));
});

test("returns NBA Hit the Ice rules with weekend days and tiebreakers", () => {
  const rules = getPoolRules({
    poolType: "crazy_8s",
    sport: "nba",
  });
  assert.ok(rules);
  assert.equal(rules.title, "NBA Hit the Ice Rules");

  const items = rules.sections.flatMap((section) => section.items);
  assert.ok(items.some((item) => item.includes("Friday, Saturday and Sunday")));
  assert.ok(items.some((item) => item.includes("total points")));
  assert.ok(items.some((item) => item.includes("three-pointers made")));
});

test("returns rules for NHL Survivor Season", () => {
  const rules = getPoolRules({ poolType: "season", sport: "nhl" });
  assert.ok(rules);
  assert.equal(rules.title, "NHL Survivor Season Rules");
  assert.equal(rules.sections.length, 4);
});

test("includes NHL Survivor season reuse and lock rules", () => {
  const rules = getPoolRules({ poolType: "season", sport: "nhl" });
  assert.ok(rules);
  const items = rules.sections.flatMap((section) => section.items);
  assert.ok(items.includes("Each team can be used only once per season."));
  assert.ok(items.includes("You can change your pick until that team's game starts. Then the pick locks."));
  assert.equal(
    rules.sections.find((section) => section.heading === "Scoring or elimination")?.items[0],
    "The week settles after all of Saturday's games finish, then the pool moves to the next week.",
  );
});

test("uses locked submission wording for NHL and NBA Hit the Ice", () => {
  for (const sport of ["nhl", "nba"] as const) {
    const rules = getPoolRules({ poolType: "crazy_8s", sport });
    assert.ok(rules);
    const picksAndDeadlines = rules.sections.find((section) => section.heading === "Picks and deadlines");
    assert.deepEqual(picksAndDeadlines?.items, [
      "Submit all your picks together before the first game you picked starts.",
      "Once you submit, your picks are locked in. A second submission is refused.",
    ]);
  }
});

test("keeps NHL daily Pick-Em without rules", () => {
  assert.equal(getPoolRules({ poolType: "pickem", sport: "nhl", pickFrequency: "daily" }), null);
});

test("keeps MLB Pick-Em without rules", () => {
  assert.equal(getPoolRules({ poolType: "pickem", sport: "mlb", pickFrequency: "weekly" }), null);
});

test("keeps MLB Hit the Ice without rules", () => {
  assert.equal(getPoolRules({ poolType: "crazy_8s", sport: "mlb" }), null);
});

test("keeps the NFL rules unchanged", () => {
  const survivor = getPoolRules({ poolType: "season", sport: "nfl" });
  const pickEm = getPoolRules({ poolType: "pickem_season", sport: "nfl" });

  assert.equal(survivor?.title, "NFL Survivor Season Rules");
  assert.equal(survivor?.sections.length, 5);
  assert.equal(pickEm?.title, "NFL Pick-Ems Season Rules");
  assert.equal(pickEm?.sections.length, 5);
});

test("returns no empty sections for every supported pool type", () => {
  const supportedPools = [
    { poolType: "season", sport: "nfl" },
    { poolType: "pickem_season", sport: "nfl" },
    { poolType: "pickem", sport: "nhl", pickFrequency: "weekly" },
    { poolType: "crazy_8s", sport: "nhl" },
    { poolType: "season", sport: "nhl" },
    { poolType: "crazy_8s", sport: "nba" },
  ];

  for (const pool of supportedPools) {
    const rules = getPoolRules(pool);
    assert.ok(rules);
    assert.ok(rules.sections.every((section) => section.items.length > 0));
  }
});