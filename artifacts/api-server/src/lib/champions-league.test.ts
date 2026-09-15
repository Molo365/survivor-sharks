import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchCurrentChampionsLeagueSlate,
  normalizeChampionsLeagueMetadata,
  parseGame,
  regulationScoreFromEspn,
  resolveCurrentChampionsLeagueSlate,
} from "./espn";
import {
  championsLeagueRegulationOutcome,
  isThreeWayPickOption,
} from "./champions-league-pickem";
import {
  buildChampionsLeagueClosurePlan,
  championsLeagueGameMatchesPoolSeason,
  resolveTerminalChampionsLeagueSlate,
  resolveTerminalChampionsLeagueSlateForPool,
} from "./champions-league-closure-logic";

describe("Champions League ESPN normalization", () => {
  it("keeps league phase matchdays as one metadata period", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - League Phase - Matchday 6"),
      { phaseSlug: "league-phase", phaseLabel: "League Phase", matchday: 6 },
    );
  });

  it("recognizes ESPN's hyphenated competition phase slugs", () => {
    assert.equal(normalizeChampionsLeagueMetadata("league-phase").phaseSlug, "league-phase");
    assert.equal(
      normalizeChampionsLeagueMetadata("knockout-round-playoffs").phaseSlug,
      "knockout-round-playoffs",
    );
    assert.equal(normalizeChampionsLeagueMetadata("round-of-16").phaseSlug, "round-of-16");
  });

  it("labels both knockout legs without treating them as aggregate picks", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Quarterfinals - 1st Leg"),
      { phaseSlug: "quarterfinals", phaseLabel: "Quarterfinals", legNumber: 1, legLabel: "1st Leg" },
    );
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Semifinals - 2nd Leg"),
      { phaseSlug: "semifinals", phaseLabel: "Semifinals", legNumber: 2, legLabel: "2nd Leg" },
    );
  });

  it("never gives the final a leg artifact", () => {
    assert.deepEqual(
      normalizeChampionsLeagueMetadata("UEFA Champions League - Final - 1st Leg"),
      { phaseSlug: "final", phaseLabel: "Final" },
    );
  });

  it("keeps ESPN's current league-phase schedule visible when matchday metadata is absent", () => {
    const games = [
      {
        id: "match-1",
        date: "2026-09-08T16:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
      },
      {
        id: "match-2",
        date: "2026-09-10T19:00:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
      },
    ] as Parameters<typeof resolveCurrentChampionsLeagueSlate>[0];

    const slate = resolveCurrentChampionsLeagueSlate(games, new Date("2026-09-06T16:00:00Z"));
    assert.equal(slate?.phaseSlug, "league-phase");
    assert.equal(slate?.matchday, undefined);
    assert.deepEqual(slate?.dates, ["2026-09-08", "2026-09-10"]);
    assert.equal(slate?.games.length, 2);
  });

  it("selects the next date-clustered matchday without merging later fixtures", () => {
    const games = [
      {
        id: "matchday-2-tuesday",
        date: "2026-10-13T16:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
      },
      {
        id: "matchday-2-wednesday",
        date: "2026-10-14T19:00:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
      },
      {
        id: "matchday-3-tuesday",
        date: "2026-10-20T16:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
      },
      {
        id: "matchday-3-wednesday",
        date: "2026-10-21T19:00:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
      },
      {
        id: "matchday-4-tuesday",
        date: "2026-11-03T17:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
      },
    ] as Parameters<typeof resolveCurrentChampionsLeagueSlate>[0];

    const slate = resolveCurrentChampionsLeagueSlate(games, new Date("2026-09-13T16:00:00Z"));

    assert.deepEqual(slate?.dates, ["2026-10-13", "2026-10-14"]);
    assert.deepEqual(slate?.games.map((game) => game.id), [
      "matchday-2-tuesday",
      "matchday-2-wednesday",
    ]);
  });

  it("advances to the next date cluster once the prior matchday concludes", () => {
    const games = [
      {
        id: "matchday-2-tuesday",
        date: "2026-10-13T16:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "final",
        isCompleted: true,
      },
      {
        id: "matchday-2-wednesday",
        date: "2026-10-14T19:00:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "final",
        isCompleted: true,
      },
      {
        id: "matchday-3-tuesday",
        date: "2026-10-20T16:45:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
        isCompleted: false,
      },
      {
        id: "matchday-3-wednesday",
        date: "2026-10-21T19:00:00Z",
        phaseSlug: "league-phase",
        phaseLabel: "League Phase",
        status: "scheduled",
        isCompleted: false,
      },
    ] as Parameters<typeof resolveCurrentChampionsLeagueSlate>[0];

    const slate = resolveCurrentChampionsLeagueSlate(games, new Date("2026-10-15T12:00:00Z"));

    assert.deepEqual(slate?.dates, ["2026-10-20", "2026-10-21"]);
    assert.deepEqual(slate?.games.map((game) => game.id), [
      "matchday-3-tuesday",
      "matchday-3-wednesday",
    ]);
  });

  it("keeps knockout legs separate and advances after the first leg concludes", () => {
    const games = [
      {
        id: "round-of-16-first-leg-tuesday",
        date: "2027-03-09T17:45:00Z",
        phaseSlug: "round-of-16",
        phaseLabel: "Round of 16",
        legNumber: 1,
        legLabel: "1st Leg",
        status: "final",
        isCompleted: true,
      },
      {
        id: "round-of-16-first-leg-wednesday",
        date: "2027-03-10T20:00:00Z",
        phaseSlug: "round-of-16",
        phaseLabel: "Round of 16",
        legNumber: 1,
        legLabel: "1st Leg",
        status: "final",
        isCompleted: true,
      },
      {
        id: "round-of-16-second-leg-tuesday",
        date: "2027-03-16T17:45:00Z",
        phaseSlug: "round-of-16",
        phaseLabel: "Round of 16",
        legNumber: 2,
        legLabel: "2nd Leg",
        status: "scheduled",
        isCompleted: false,
      },
      {
        id: "round-of-16-second-leg-wednesday",
        date: "2027-03-17T20:00:00Z",
        phaseSlug: "round-of-16",
        phaseLabel: "Round of 16",
        legNumber: 2,
        legLabel: "2nd Leg",
        status: "scheduled",
        isCompleted: false,
      },
    ] as Parameters<typeof resolveCurrentChampionsLeagueSlate>[0];

    const slate = resolveCurrentChampionsLeagueSlate(games, new Date("2027-03-11T12:00:00Z"));

    assert.equal(slate?.legNumber, 2);
    assert.equal(slate?.legLabel, "2nd Leg");
    assert.deepEqual(slate?.dates, ["2027-03-16", "2027-03-17"]);
  });

  it("fetches far enough ahead and returns only October 13-14 on September 13", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    const makeEvent = (id: string, date: string) => ({
      id,
      date,
      season: { year: 2026, type: 14534, slug: "league-phase" },
      competitions: [{
        status: { type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" } },
        competitors: [
          { homeAway: "home", score: "0", team: { id: `${id}-home`, abbreviation: "H", displayName: "Home" } },
          { homeAway: "away", score: "0", team: { id: `${id}-away`, abbreviation: "A", displayName: "Away" } },
        ],
      }],
    });

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        events: [
          makeEvent("matchday-2-tuesday", "2026-10-13T16:45:00Z"),
          makeEvent("matchday-2-wednesday", "2026-10-14T19:00:00Z"),
          makeEvent("matchday-3-tuesday", "2026-10-20T16:45:00Z"),
          makeEvent("matchday-3-wednesday", "2026-10-21T19:00:00Z"),
        ],
      }));
    };

    try {
      const slate = await fetchCurrentChampionsLeagueSlate(new Date("2026-09-13T16:00:00Z"));
      assert.match(requestedUrls[0]!, /dates=20260911-20261112/);
      assert.deepEqual(slate?.dates, ["2026-10-13", "2026-10-14"]);
      assert.equal(slate?.games.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("applies the widened date bounds to the season-feed fallback", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    const makeEvent = (id: string, date: string) => ({
      id,
      date,
      season: { year: 2026, type: 14534, slug: "league-phase" },
      competitions: [{
        status: { type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" } },
        competitors: [
          { homeAway: "home", score: "0", team: { id: `${id}-home`, abbreviation: "H", displayName: "Home" } },
          { homeAway: "away", score: "0", team: { id: `${id}-away`, abbreviation: "A", displayName: "Away" } },
        ],
      }],
    });

    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        events: requestedUrls.length === 1
          ? []
          : [
              makeEvent("inside-window", "2026-10-13T16:45:00Z"),
              makeEvent("outside-window", "2026-12-15T20:00:00Z"),
            ],
      }));
    };

    try {
      const slate = await fetchCurrentChampionsLeagueSlate(new Date("2026-09-13T16:00:00Z"));
      assert.match(requestedUrls[0]!, /dates=20260911-20261112/);
      assert.match(requestedUrls[1]!, /dates=2026/);
      assert.deepEqual(slate?.games.map((game) => game.id), ["inside-window"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("matches simulated picks across every resolved fixture date, not the current calendar week", () => {
    const games = [
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `sep-08-${index + 1}`,
        date: `2026-09-08T${String(16 + (index % 4)).padStart(2, "0")}:45:00Z`,
        phaseSlug: "league-phase" as const,
        phaseLabel: "League Phase",
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `sep-09-${index + 1}`,
        date: `2026-09-09T${String(16 + (index % 4)).padStart(2, "0")}:45:00Z`,
        phaseSlug: "league-phase" as const,
        phaseLabel: "League Phase",
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `sep-10-${index + 1}`,
        date: `2026-09-10T${String(16 + (index % 4)).padStart(2, "0")}:45:00Z`,
        phaseSlug: "league-phase" as const,
        phaseLabel: "League Phase",
      })),
    ] as Parameters<typeof resolveCurrentChampionsLeagueSlate>[0];

    const slate = resolveCurrentChampionsLeagueSlate(games, new Date("2026-09-06T16:00:00Z"));
    assert.ok(slate);

    const simulatedPicks = slate.games.map((game) => ({
      gameId: game.id,
      gameDate: game.date.slice(0, 10),
    }));
    const periodPicks = simulatedPicks.filter((pick) => slate.dates.includes(pick.gameDate));
    const currentCalendarWeekPicks = simulatedPicks.filter(
      (pick) => pick.gameDate >= "2026-08-31" && pick.gameDate <= "2026-09-06",
    );

    assert.equal(periodPicks.length, 18);
    assert.equal(currentCalendarWeekPicks.length, 0);
  });

  it("grades an extra-time match from its two regulation periods only", () => {
    const home = { score: "3", linescores: [{ period: 1, value: 1 }, { period: 2, value: 0 }, { period: 3, value: 2 }] };
    const away = { score: "1", linescores: [{ period: 1, value: 0 }, { period: 2, value: 1 }, { period: 3, value: 0 }] };
    assert.deepEqual(regulationScoreFromEspn(home, away, "Final/Extra Time"), { homeScore: 1, awayScore: 1 });
  });

  it("does not fall back to the extra-time final score when regulation is absent", () => {
    assert.deepEqual(
      regulationScoreFromEspn({ score: "2" }, { score: "1" }, "Final - AET"),
      { homeScore: null, awayScore: null },
    );
  });
});

describe("Champions League Pick-Em decisions", () => {
  it("accepts each of the three submission options and rejects team IDs", () => {
    for (const option of ["home_win", "draw", "away_win"]) {
      assert.equal(isThreeWayPickOption(option), true);
    }
    // The route calls this predicate before storing picks, so a team ID cannot
    // accidentally become a two-way selection in a 3-way competition.
    assert.equal(isThreeWayPickOption("real-madrid"), false);
    assert.equal(isThreeWayPickOption("home"), false);
    assert.equal(isThreeWayPickOption("penalties"), false);
  });

  it("uses the individual event's regulation result, not its ET final", () => {
    const extraTimeFixture = {
      isCompleted: true,
      // The match was level after 90, then home won in extra time.
      homeScore: 3,
      awayScore: 1,
      regulationHomeScore: 1,
      regulationAwayScore: 1,
    };
    assert.equal(championsLeagueRegulationOutcome(extraTimeFixture), "draw");
  });

  it("refuses the grading decision for extra time when ESPN lacks regulation", () => {
    const incompleteRegulationFixture = {
      isCompleted: true,
      homeScore: 2,
      awayScore: 1,
      regulationHomeScore: null,
      regulationAwayScore: null,
    };
    assert.equal(championsLeagueRegulationOutcome(incompleteRegulationFixture), null);
  });
});

describe("Champions League tournament closure", () => {
  it("recognizes ESPN's completed 2025-26 Final as the terminal no-leg period", () => {
    const final = parseGame({
      id: "401862897",
      date: "2026-05-30T16:00Z",
      season: { year: 2025, type: 13677, slug: "final" },
      competitions: [{
        status: {
          type: {
            state: "post",
            completed: true,
            name: "STATUS_FINAL_PEN",
            shortDetail: "FT-Pens",
          },
        },
        notes: [{ headline: "Paris Saint-Germain win 4-3 on penalties" }],
        competitors: [
          {
            homeAway: "home",
            score: "1",
            team: { id: "psg", abbreviation: "PSG", displayName: "Paris Saint-Germain" },
          },
          {
            homeAway: "away",
            score: "1",
            team: { id: "ars", abbreviation: "ARS", displayName: "Arsenal" },
          },
        ],
      }],
    });

    const terminal = resolveTerminalChampionsLeagueSlate(
      [final],
      new Date("2026-05-31T12:00:00Z"),
    );

    assert.equal(terminal?.phaseSlug, "final");
    assert.equal(terminal?.legNumber, undefined);
    assert.deepEqual(terminal?.games.map((game) => game.id), ["401862897"]);
  });

  it("does not treat the last known semifinal as terminal during a schedule gap", () => {
    const semifinal = {
      id: "semifinal-second-leg",
      date: "2026-05-06T19:00:00Z",
      phaseSlug: "semifinals",
      phaseLabel: "Semifinals",
      legNumber: 2,
      legLabel: "2nd Leg",
      status: "final",
      isCompleted: true,
      homeScore: 2,
      awayScore: 1,
    } as Parameters<typeof resolveTerminalChampionsLeagueSlate>[0][number];

    assert.equal(
      resolveTerminalChampionsLeagueSlate(
        [semifinal],
        new Date("2026-05-20T12:00:00Z"),
      ),
      null,
    );
  });

  it("does not trust incidental Final text without ESPN's structured phase slug", () => {
    const misleading = parseGame({
      id: "semifinal-note",
      date: "2026-05-06T19:00:00Z",
      season: { year: 2025, type: 13677 },
      competitions: [{
        status: {
          type: { state: "post", completed: true, name: "STATUS_FINAL" },
        },
        notes: [{ headline: "Winner advances to Final" }],
        competitors: [
          {
            homeAway: "home",
            score: "2",
            team: { id: "home", abbreviation: "H", displayName: "Home" },
          },
          {
            homeAway: "away",
            score: "1",
            team: { id: "away", abbreviation: "A", displayName: "Away" },
          },
        ],
      }],
    });

    assert.equal(misleading.phaseSlug, "final");
    assert.equal(misleading.championsLeaguePhaseSource, undefined);
    assert.equal(
      resolveTerminalChampionsLeagueSlate(
        [misleading],
        new Date("2026-05-07T12:00:00Z"),
      ),
      null,
    );
  });

  it("matches both start-year and final-year pool season conventions safely", () => {
    const final = {
      id: "final",
      date: "2026-05-30T16:00:00Z",
      seasonYear: 2025,
    } as Parameters<typeof championsLeagueGameMatchesPoolSeason>[0];

    assert.equal(
      championsLeagueGameMatchesPoolSeason(final, {
        season: 2025,
        createdAt: new Date("2025-09-01T12:00:00Z"),
      }),
      true,
    );
    assert.equal(
      championsLeagueGameMatchesPoolSeason(final, {
        season: 2026,
        createdAt: new Date("2026-02-01T12:00:00Z"),
      }),
      true,
    );
    assert.equal(
      championsLeagueGameMatchesPoolSeason(final, {
        season: 2026,
        createdAt: new Date("2026-09-01T12:00:00Z"),
      }),
      false,
    );
  });

  it("allows a June-created pool to close from the following year's Final", () => {
    const nextFinal = {
      id: "2027-final",
      date: "2027-05-29T19:00:00Z",
      seasonYear: 2026,
      phaseSlug: "final",
      phaseLabel: "Final",
      championsLeaguePhaseSource: "season_slug",
      status: "final",
      isCompleted: true,
      homeScore: 2,
      awayScore: 1,
    } as Parameters<typeof resolveTerminalChampionsLeagueSlateForPool>[0][number];

    assert.equal(
      resolveTerminalChampionsLeagueSlateForPool(
        [nextFinal],
        {
          season: 2026,
          createdAt: new Date("2026-06-15T12:00:00Z"),
        },
        new Date("2027-05-30T12:00:00Z"),
      )?.games[0]?.id,
      "2027-final",
    );
  });

  it("does not close on a scheduled Final", () => {
    const scheduledFinal = {
      id: "scheduled-final",
      date: "2026-05-30T16:00:00Z",
      phaseSlug: "final",
      phaseLabel: "Final",
      status: "scheduled",
      isCompleted: false,
      homeScore: null,
      awayScore: null,
    } as Parameters<typeof resolveTerminalChampionsLeagueSlate>[0][number];

    assert.equal(
      resolveTerminalChampionsLeagueSlate(
        [scheduledFinal],
        new Date("2026-05-29T12:00:00Z"),
      ),
      null,
    );
  });

  it("splits occupied prize places evenly among tied tournament winners", () => {
    const plan = buildChampionsLeagueClosurePlan(
      [
        { userId: 1, correct: 20 },
        { userId: 2, correct: 20 },
        { userId: 3, correct: 18 },
      ],
      {
        prizeStructure: [
          { place: 1, amount: 60 },
          { place: 2, amount: 30 },
          { place: 3, amount: 10 },
        ],
        prizeMode: "pct",
        entryFee: null,
        prizePot: 1000,
        maxEntries: 10,
      },
    );

    assert.deepEqual(plan, [
      {
        userIds: [1, 2],
        finishPosition: 1,
        finalWinner: true,
        prizeAmount: 450,
      },
      {
        userIds: [3],
        finishPosition: 2,
        finalWinner: false,
        prizeAmount: 100,
      },
    ]);
  });
});