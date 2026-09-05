import assert from "node:assert/strict";
import test from "node:test";
import { clearNdpLockCacheForTests, getNdpLockState, resolveNdpLock } from "./ndp-lock";
import type { EspnGame } from "./espn";

const game = (date: string, seasonYear = 2026, seasonType = 2): EspnGame => ({
  id: date, date, seasonYear, seasonType, status: "scheduled", homeTeam: { id: "1", abbreviation: "A", displayName: "A" },
  awayTeam: { id: "2", abbreviation: "B", displayName: "B" }, homeScore: null, awayScore: null,
  homeRecord: null, awayRecord: null, isCompleted: false, isPostponed: false, hasStarted: false,
  liveState: null, homeStartingPitcher: null, awayStartingPitcher: null, groupLabel: null,
  homeLinescores: [], awayLinescores: [],
});

test("selects the earliest valid regular-season kickoff", async () => {
  clearNdpLockCacheForTests();
  const state = await resolveNdpLock(2026, { now: new Date("2026-01-01Z"), fetchWeek: async () => [
    game("2026-09-11T00:20:00Z"), game("2026-09-10T00:20:00Z"),
  ] });
  assert.equal(state.lockAt?.toISOString(), "2026-09-10T00:20:00.000Z");
  assert.equal(state.source, "espn");
});

test("ignores wrong-season and non-regular-season candidates", async () => {
  clearNdpLockCacheForTests();
  const state = await resolveNdpLock(2026, { now: new Date("2026-01-01Z"), fetchWeek: async () => [
    game("2026-08-01T00:00:00Z", 2026, 1), game("2025-09-01T00:00:00Z", 2025, 2),
    game("2026-09-10T00:20:00Z"),
  ] });
  assert.equal(state.lockAt?.toISOString(), "2026-09-10T00:20:00.000Z");
});

test("uses a cached ESPN timestamp after a later fetch failure", async () => {
  clearNdpLockCacheForTests();
  await resolveNdpLock(2026, { fetchWeek: async () => [game("2026-09-10T00:20:00Z")] });
  const state = await resolveNdpLock(2026, { fetchWeek: async () => { throw new Error("ESPN down"); } });
  assert.equal(state.source, "cache");
  assert.equal(state.lockAt?.toISOString(), "2026-09-10T00:20:00.000Z");
});

test("uses the configured fallback when ESPN has no valid event", async () => {
  clearNdpLockCacheForTests();
  const state = await resolveNdpLock(2026, { now: new Date("2026-01-01Z"), fetchWeek: async () => [] });
  assert.equal(state.source, "fallback");
  assert.equal(state.lockAt?.toISOString(), "2026-09-10T00:20:00.000Z");
});

test("derives deterministic fallbacks for unmapped historical and future seasons", async () => {
  clearNdpLockCacheForTests();
  const [historical, future] = await Promise.all([
    resolveNdpLock(2024, { fetchWeek: async () => [] }),
    resolveNdpLock(2030, { fetchWeek: async () => [] }),
  ]);
  assert.equal(historical.source, "fallback");
  assert.equal(historical.lockAt?.toISOString(), "2024-09-06T00:20:00.000Z");
  assert.equal(future.source, "fallback");
  assert.equal(future.lockAt?.toISOString(), "2030-09-06T00:20:00.000Z");
});

test("rejects absurd NFL season input", async () => {
  clearNdpLockCacheForTests();
  await assert.rejects(
    resolveNdpLock(1800, { fetchWeek: async () => [] }),
    /Invalid NFL season for NDP lock: 1800/,
  );
});

test("locks exactly at kickoff and sandbox remains explicitly unlocked", async () => {
  clearNdpLockCacheForTests();
  const kickoff = "2026-09-10T00:20:00Z";
  const state = await resolveNdpLock(2026, { now: new Date(kickoff), fetchWeek: async () => [game(kickoff)] });
  assert.equal(state.locked, true);
  const sandbox = await getNdpLockState(2026, true, { now: new Date("2030-01-01Z") });
  assert.deepEqual(sandbox, { lockAt: null, locked: false, source: "sandbox" });
});