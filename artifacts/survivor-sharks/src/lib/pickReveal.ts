/**
 * Client-side pick visibility — mirrors api-server pickem `isPickRevealed` and
 * the PicksGrid guard so PDF exports cannot leak opponent picks the on-screen grid hides.
 */

export function isOpponentPickVisible(opts: {
  isOwnPick: boolean;
  result?: string | null;
  gameStartTime?: string | null;
  sandboxMode?: boolean;
}): boolean {
  if (opts.isOwnPick) return true;
  if (opts.sandboxMode) return opts.result != null && opts.result !== "pending";
  if (opts.result != null && opts.result !== "pending") return true;
  if (!opts.gameStartTime) return false;
  return new Date(opts.gameStartTime).getTime() <= Date.now();
}

export function getVisiblePickEmPick<
  T extends { pickedTeamId: string | null; result?: string | null },
>(
  pick: T | undefined,
  opts: {
    entryUserId: number;
    currentUserId: number | null;
    gameStartTime?: string | null;
    sandboxMode?: boolean;
  },
): T | undefined {
  if (!pick) return undefined;
  const isOwnPick = opts.currentUserId != null && opts.entryUserId === opts.currentUserId;
  // API redacts opponent picks by nulling pickedTeamId; non-null means the server already applied reveal rules.
  if (!isOwnPick && pick.pickedTeamId == null) return undefined;
  if (isOwnPick && pick.pickedTeamId == null) return undefined;
  // When kickoff time is on the game column, keep client-side guard for stale cached responses.
  if (!isOwnPick && opts.gameStartTime) {
    if (!isOpponentPickVisible({
      isOwnPick: false,
      result: pick.result,
      gameStartTime: opts.gameStartTime,
      sandboxMode: opts.sandboxMode,
    })) {
      return undefined;
    }
  }
  return pick;
}

type PickEmGameTeams = {
  awayTeam: { id: string; abbreviation: string };
  homeTeam: { id: string; abbreviation: string };
};

/** Abbreviation (+ optional W/L suffix) for PDF / export cells. */
export function formatPickEmPickExport(
  pick: { pickedTeamId: string; result?: string | null },
  game: PickEmGameTeams,
  options?: { includeResultSuffix?: boolean },
): string {
  const isDraw = pick.pickedTeamId === "draw";
  const isAway = pick.pickedTeamId === game.awayTeam.id;
  const abbrev = isDraw
    ? "DRAW"
    : pick.pickedTeamId === "away_win" || isAway
      ? game.awayTeam.abbreviation
      : game.homeTeam.abbreviation;
  if (!options?.includeResultSuffix) return abbrev;
  const suffix =
    pick.result === "correct" ? " W"
    : pick.result === "incorrect" ? " L"
    : pick.result === "push" ? " TIE"
    : pick.result === "postponed" ? " PPD"
    : "";
  return `${abbrev}${suffix}`;
}
