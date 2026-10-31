import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSortedDatesIntoChampionsLeaguePeriods,
  mergeChampionsLeaguePeriodsWithLiveSlate,
  pickChampionsLeaguePeriodIndices,
  toPoolPeriod,
  type ChampionsLeaguePoolPeriod,
} from "./champions-league-pool-period";
import {
  CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS,
  resolveChampionsLeagueDefaultPeriodKey,
} from "./champions-league-default-period";

function period(dates: string[]): ChampionsLeaguePoolPeriod {
  const sorted = [...dates].sort();
  return { dates: sorted, weekStart: sorted[0]!, weekEnd: sorted[sorted.length - 1]! };
}

test("defaults to the last completed matchday during the post-matchday grace gap", () => {
  const previous = toPoolPeriod(["2026-10-20", "2026-10-21"]);
  const current = toPoolPeriod(["2026-11-03", "2026-11-04"]);
  const ctx = { current, previous };
  const dayAfter = new Date("2026-10-22T19:00:00-04:00");
  assert.equal(
    resolveChampionsLeagueDefaultPeriodKey(ctx, false, dayAfter),
    previous.weekStart,
  );
});

test("adds the live ESPN slate when the pool has no pick history yet", () => {
  const merged = mergeChampionsLeaguePeriodsWithLiveSlate([], ["2026-10-21", "2026-10-22"]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]!.dates, ["2026-10-21", "2026-10-22"]);
  assert.equal(
    pickChampionsLeaguePeriodIndices(merged, [], ["2026-10-21", "2026-10-22"]).current,
    0,
  );
});

test("splits flattened ESPN visible/upcoming/lastCompleted dates into separate matchdays", () => {
  const espnDates = ["2026-10-20", "2026-10-21", "2026-11-03", "2026-11-04"];
  const merged = mergeChampionsLeaguePeriodsWithLiveSlate([], espnDates);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0]!.dates, ["2026-10-20", "2026-10-21"]);
  assert.deepEqual(merged[1]!.dates, ["2026-11-03", "2026-11-04"]);
  const { current } = pickChampionsLeaguePeriodIndices(
    merged,
    ["2026-10-20"],
    ["2026-11-03", "2026-11-04"],
  );
  assert.equal(current, 1);
});

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

test("defaults to previous matchday for several days after it ends", () => {
  const previous = period(["2026-10-13", "2026-10-14"]);
  const current = period(["2026-10-20", "2026-10-21"]);
  const ctx = { current, previous };
  const dayAfter = new Date("2026-10-15T20:00:00Z");
  assert.equal(
    resolveChampionsLeagueDefaultPeriodKey(ctx, true, dayAfter),
    previous.weekStart,
  );
  const afterGrace = new Date(
    dayAfter.getTime() + CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS + 86_400_000,
  );
  assert.equal(
    resolveChampionsLeagueDefaultPeriodKey(ctx, true, afterGrace),
    current.weekStart,
  );
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
