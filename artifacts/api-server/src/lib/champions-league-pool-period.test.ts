import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSortedDatesIntoChampionsLeaguePeriods,
  pickChampionsLeaguePeriodIndices,
  type ChampionsLeaguePoolPeriod,
} from "./champions-league-pool-period";

function period(dates: string[]): ChampionsLeaguePoolPeriod {
  const sorted = [...dates].sort();
  return { dates: sorted, weekStart: sorted[0]!, weekEnd: sorted[sorted.length - 1]! };
}

test("groups UEFA matchday dates and splits on long gaps", () => {
  const periods = groupSortedDatesIntoChampionsLeaguePeriods([
    "2026-09-16",
    "2026-09-17",
    "2026-10-01",
    "2026-10-02",
  ]);
  assert.deepEqual(periods, [
    ["2026-09-16", "2026-09-17"],
    ["2026-10-01", "2026-10-02"],
  ]);
});

test("keeps a single midweek matchday as one period", () => {
  const periods = groupSortedDatesIntoChampionsLeaguePeriods(["2026-10-21"]);
  assert.deepEqual(periods, [["2026-10-21"]]);
});

test("treats a lone graded matchday as previous when ESPN still maps it as current", () => {
  const periods = [period(["2026-09-16", "2026-09-17"])];
  const selection = pickChampionsLeaguePeriodIndices(
    periods,
    ["2026-09-16"],
    ["2026-09-16", "2026-09-17"],
  );
  assert.deepEqual(selection, { current: null, previous: 0 });
});

test("picks the latest graded period between slates", () => {
  const periods = [
    period(["2026-09-16", "2026-09-17"]),
    period(["2026-10-01", "2026-10-02"]),
  ];
  assert.deepEqual(
    pickChampionsLeaguePeriodIndices(periods, ["2026-09-16", "2026-10-01"], []),
    { current: null, previous: 1 },
  );
  assert.deepEqual(
    pickChampionsLeaguePeriodIndices(periods, ["2026-09-16", "2026-10-01"], ["2026-10-01", "2026-10-02"]),
    { current: 1, previous: 0 },
  );
});
