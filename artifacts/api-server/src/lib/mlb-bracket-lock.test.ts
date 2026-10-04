import test from "node:test";
import assert from "node:assert/strict";
import { firstMlbWildCardPitchMs, getMlbBracketPlayoffStartState } from "./mlb-bracket-lock";
import type { MlbPostseasonFetchResult } from "./mlb-bracket";

function slateWithWildCardStart(iso: string): MlbPostseasonFetchResult {
  return {
    failedMonths: [],
    series: [
      {
        seriesId: "wc1",
        round: "wild_card",
        seriesSlot: "AL_WC_1",
        team1: "A",
        team2: "B",
        team1Wins: 0,
        team2Wins: 0,
        liveGame: null,
        team1LogoUrl: null,
        team2LogoUrl: null,
        games: 0,
        startsAt: new Date(iso),
        winner: null,
        completed: false,
        completedAt: null,
      },
    ],
  };
}

test("firstMlbWildCardPitchMs uses earliest wild card series", () => {
  const slate: MlbPostseasonFetchResult = {
    failedMonths: [],
    series: [
      { ...slateWithWildCardStart("2026-10-05T20:00:00Z").series[0]!, seriesSlot: "NL_WC_1" },
      { ...slateWithWildCardStart("2026-10-04T18:00:00Z").series[0]!, seriesSlot: "AL_WC_1" },
    ],
  };
  assert.equal(firstMlbWildCardPitchMs(slate), new Date("2026-10-04T18:00:00Z").getTime());
});

test("getMlbBracketPlayoffStartState reports started after first wild card pitch", async () => {
  const slate = slateWithWildCardStart("2020-01-01T12:00:00Z");
  assert.equal(await getMlbBracketPlayoffStartState(2026, slate), "started");
});

test("getMlbBracketPlayoffStartState reports not_started before first wild card pitch", async () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const slate = slateWithWildCardStart(future);
  assert.equal(await getMlbBracketPlayoffStartState(2026, slate), "not_started");
});
