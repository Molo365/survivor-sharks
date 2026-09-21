import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPlaceLine,
  getBannerModel,
  type CrazyEightsPeriodResult,
} from "./periodResults";

function result(overrides: Partial<CrazyEightsPeriodResult> = {}): CrazyEightsPeriodResult {
  return {
    week: 4,
    resolvedAt: "2026-09-20T23:00:00.000Z",
    reason: "outright winner",
    groups: [
      {
        position: 1,
        prize: 1520,
        players: [{ userId: 1, username: "Dimitrios" }],
      },
    ],
    ...overrides,
  };
}

test("returns null when there are no period results", () => {
  assert.equal(getBannerModel([]), null);
});

test("builds the banner from the newest result and keeps every place", () => {
  const model = getBannerModel([
    result({
      week: 8,
      groups: [
        {
          position: 2,
          prize: 760,
          players: [{ userId: 2, username: "Second" }],
        },
        {
          position: 1,
          prize: 1520,
          players: [{ userId: 1, username: "First" }],
        },
      ],
    }),
    result({ week: 7 }),
  ]);

  assert.deepEqual(model, {
    label: "Weekend 8",
    noPicks: false,
    places: [
      { position: 1, names: ["First"], prize: 1520 },
      { position: 2, names: ["Second"], prize: 760 },
    ],
  });
});

test("joins co-winners and marks the shared prize as each", () => {
  assert.equal(
    formatPlaceLine({
      position: 1,
      names: ["A", "B"],
      prize: 760,
    }),
    "1st: A & B · $760 each",
  );
});

test("marks an empty or no-picks result as no picks", () => {
  assert.equal(getBannerModel([result({ reason: "no picks", groups: [] })])?.noPicks, true);
  assert.equal(getBannerModel([result({ reason: "outcome", groups: [] })])?.noPicks, true);
});

test("formats place lines with ordinal positions and currency", () => {
  assert.equal(
    formatPlaceLine({ position: 2, names: ["Dimitrios"], prize: 1520 }),
    "2nd: Dimitrios · $1,520",
  );
  assert.equal(
    formatPlaceLine({ position: 11, names: ["Player"], prize: 12.5 }),
    "11th: Player · $12.50",
  );
});