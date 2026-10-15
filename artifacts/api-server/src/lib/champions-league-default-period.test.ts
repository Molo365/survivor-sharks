import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS,
  resolveChampionsLeagueDefaultPeriodKey,
} from "./champions-league-default-period";
import type { ChampionsLeaguePeriodContext } from "./champions-league-pool-period";

function period(dates: string[]) {
  const sorted = [...dates].sort();
  return { dates: sorted, weekStart: sorted[0]!, weekEnd: sorted[sorted.length - 1]! };
}

test("defaults to previous matchday for several days after it ends", () => {
  const ctx: ChampionsLeaguePeriodContext = {
    previous: period(["2026-10-13", "2026-10-14"]),
    current: period(["2026-10-20", "2026-10-21"]),
  };
  const dayAfter = new Date("2026-10-15T20:00:00Z");
  assert.equal(
    resolveChampionsLeagueDefaultPeriodKey(ctx, true, dayAfter),
    ctx.previous!.weekStart,
  );
  const afterGrace = new Date(
    dayAfter.getTime() + CHAMPIONS_LEAGUE_POST_MATCHDAY_GRACE_MS + 86_400_000,
  );
  assert.equal(
    resolveChampionsLeagueDefaultPeriodKey(ctx, true, afterGrace),
    ctx.current!.weekStart,
  );
});
