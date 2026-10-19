/** User-facing copy for NFL office pools (excludes division predictor). */

const SUNDAY_SLATE_ANCHOR =
  "1:00 PM ET on the week's main Sunday";

export function isNflOfficePoolHeaderPool(sport: string, poolType: string): boolean {
  if (sport !== "nfl" || poolType === "nfl_division_predictor") return false;
  return (
    poolType === "season"
    || poolType === "pickem_season"
    || poolType === "nfl_confidence"
    || poolType === "nfl_confidence_weekly"
  );
}

/** One-line hint under the pool title (chips row). */
export const NFL_OFFICE_POOL_HEADER_HINT =
  `Weekly slate closes at ${SUNDAY_SLATE_ANCHOR}: every game that hasn't started yet locks, and everyone's picks for the week become visible (including Monday night). Before then, each game locks on its own schedule.`;

export type NflOfficePoolNoticeKind = "grid" | "survivor";

export function nflOfficePoolBannerLines(kind: NflOfficePoolNoticeKind): {
  title: string;
  yourPicks: string;
  opponents: string;
} {
  if (kind === "survivor") {
    return {
      title: "Weekly pick",
      yourPicks: `Change your team until that game kicks off, or until ${SUNDAY_SLATE_ANCHOR} — whichever comes first. After that, your pick is locked for the week.`,
      opponents: `Other players' picks stay hidden until that player's game kicks off. At ${SUNDAY_SLATE_ANCHOR}, everyone's pick for the week is shown.`,
    };
  }
  return {
    title: "Weekly slate",
    yourPicks: `Each game locks on its own schedule (see Rules). Anything still open at ${SUNDAY_SLATE_ANCHOR} locks then — including Monday night.`,
    opponents: `You see an opponent's pick for a game once that game locks. At ${SUNDAY_SLATE_ANCHOR}, the full week is on the board. Players who haven't picked every game may stay hidden until they finish or the slate closes.`,
  };
}

export function nflOfficeSurvivorLockRules(): string[] {
  return [
    `You can change your weekly pick until that team's game kicks off, or until ${SUNDAY_SLATE_ANCHOR} — whichever comes first.`,
    `At ${SUNDAY_SLATE_ANCHOR}, your pick locks for the week even if the game has not started yet.`,
    `Other players' picks stay hidden until that player's game kicks off. At ${SUNDAY_SLATE_ANCHOR}, everyone's pick for the week is shown.`,
  ];
}

export function nflOfficePoolLockAndVisibilityRules(opts: {
  fiveMinutePregameLock: boolean;
}): string[] {
  const perGameLock = opts.fiveMinutePregameLock
    ? "Each game locks 5 minutes before its kickoff. You can still edit other games until they reach their own lock time."
    : "Each game locks at kickoff. You can still edit other games until they start.";

  return [
    perGameLock,
    `At ${SUNDAY_SLATE_ANCHOR}, every game that has not started yet locks for the week. You cannot add or change picks for those games after that (including Monday night).`,
    `At the same moment, everyone's picks for the week become visible. If you have not picked every game in the week, other players may not see your row until you complete the slate or the Sunday cutoff passes.`,
  ];
}
