import { describe, expect, it, vi } from "vitest";
import { etWallClockToUtc } from "./nflSlateReveal";
import { formatPickEmPickExport, getVisiblePickEmPick, isOpponentPickVisible } from "./pickReveal";

describe("isOpponentPickVisible", () => {
  it("always shows own picks", () => {
    expect(isOpponentPickVisible({ isOwnPick: true, result: "pending" })).toBe(true);
  });

  it("hides pending opponent picks before kickoff", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isOpponentPickVisible({ isOwnPick: false, result: "pending", gameStartTime: future })).toBe(false);
  });

  it("shows opponent picks after kickoff", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isOpponentPickVisible({ isOwnPick: false, result: "pending", gameStartTime: past })).toBe(true);
  });

  it("shows graded opponent picks even without start time", () => {
    expect(isOpponentPickVisible({ isOwnPick: false, result: "correct" })).toBe(true);
  });

  it("shows NFL opponent picks after 1 PM ET Sunday slate reveal", () => {
    const mnf = "2025-09-09T00:15:00Z";
    const slate = ["2025-09-07T17:00:00Z", mnf];
    vi.useFakeTimers();
    vi.setSystemTime(etWallClockToUtc("2025-09-07", 14, 0));
    expect(
      isOpponentPickVisible({
        isOwnPick: false,
        result: "pending",
        gameStartTime: mnf,
        pool: { sport: "nfl", poolType: "nfl_confidence" },
        slateGameStartTimes: slate,
      }),
    ).toBe(true);
    vi.useRealTimers();
  });
});

describe("getVisiblePickEmPick", () => {
  const pick = { pickedTeamId: "team-a", result: "pending" as const };
  const future = new Date(Date.now() + 60_000).toISOString();

  it("returns undefined when API redacted pickedTeamId", () => {
    expect(getVisiblePickEmPick(
      { pickedTeamId: null, result: "pending" },
      { entryUserId: 2, currentUserId: 1, gameStartTime: future },
    )).toBeUndefined();
  });

  it("hides opponent pick before kickoff", () => {
    expect(getVisiblePickEmPick(pick, {
      entryUserId: 2,
      currentUserId: 1,
      gameStartTime: future,
    })).toBeUndefined();
  });

  it("shows opponent pick after kickoff when API revealed team id but game startTime is missing on grid", () => {
    expect(getVisiblePickEmPick(pick, {
      entryUserId: 2,
      currentUserId: 1,
      gameStartTime: undefined,
    })).toEqual(pick);
  });
});

describe("formatPickEmPickExport", () => {
  const game = {
    awayTeam: { id: "a", abbreviation: "ARS" },
    homeTeam: { id: "h", abbreviation: "CHE" },
  };

  it("formats 3-way draw", () => {
    expect(formatPickEmPickExport({ pickedTeamId: "draw", result: "correct" }, game, { includeResultSuffix: true }))
      .toBe("DRAW W");
  });
});
