import assert from "node:assert/strict";
import test from "node:test";
import { clearNhlNdpLockCacheForTests, getNhlNdpLockState, resolveNhlNdpLock } from "./nhl-ndp-lock";
import { getNhlEspnSeasonYear } from "./espn";

test("maps an NHL pool start year to ESPN's ending-year season key", () => {
  assert.equal(getNhlEspnSeasonYear(2026), 2027);
});

test("uses the authoritative first NHL regular-season game and caches it", async () => {
  clearNhlNdpLockCacheForTests();
  const state = await resolveNhlNdpLock(2026, {
    now: new Date("2026-01-01Z"),
    fetchFirstGameDate: async (season, seasonType) => {
      assert.equal(season, 2026);
      assert.equal(seasonType, 2);
      return "2026-09-29T23:00:00Z";
    },
  });
  assert.equal(state.lockAt?.toISOString(), "2026-09-29T23:00:00.000Z");
  assert.equal((await resolveNhlNdpLock(2026, { fetchFirstGameDate: async () => null })).source, "cache");
});
test("passes the pool start year to the ESPN season resolver", async () => {
  clearNhlNdpLockCacheForTests();
  let receivedSeason = 0;
  await resolveNhlNdpLock(2026, {
    fetchFirstGameDate: async (season) => {
      receivedSeason = season;
      return "2026-10-01T23:00:00Z";
    },
  });
  assert.equal(receivedSeason, 2026);
});
test("falls back and leaves sandbox unlocked", async () => {
  clearNhlNdpLockCacheForTests();
  const state = await resolveNhlNdpLock(2026, { fetchFirstGameDate: async () => null });
  assert.equal(state.lockAt?.toISOString(), "2026-09-29T00:00:00.000Z");
  assert.deepEqual(await getNhlNdpLockState(2026, true), { lockAt: null, locked: false, source: "sandbox" });
});