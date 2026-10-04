import test from "node:test";
import assert from "node:assert/strict";
import { groupSortedDatesIntoChampionsLeaguePeriods } from "./champions-league-pool-period";

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
