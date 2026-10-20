/** User-facing copy for NFL office-pool pick visibility (excludes division predictor). */

import { PLATFORM_TUESDAY_OPENS_SENTENCE } from "./platformWeekCopy";

export const NFL_OFFICE_SUNDAY_REVEAL_SENTENCE =
  "At 1:00 PM ET on the week's main Sunday, everyone's picks for that week become visible—including games that have not kicked off yet (such as Monday night).";

export const NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE =
  "If you have not picked every game in the week, other players may not see your partial slate until you finish or the slate goes live.";

export const NFL_OFFICE_SURVIVOR_VISIBILITY_NOTICE =
  `To keep things fair, other players' picks stay hidden until that player's game kicks off. ${NFL_OFFICE_SUNDAY_REVEAL_SENTENCE} At that same 1:00 PM ET moment, weekly survivor picks lock — you cannot change your pick for the rest of the week.`;

export const NFL_OFFICE_GRID_VISIBILITY_NOTICE =
  `Picks reveal game by game as each game locks. ${NFL_OFFICE_SUNDAY_REVEAL_SENTENCE} ${NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE}`;

export function nflOfficePoolLockAndVisibilityRules(opts: {
  /** Confidence pools lock 5 minutes before kickoff; pick'em season locks at kickoff. */
  fiveMinutePregameLock: boolean;
}): string[] {
  const lockLine = opts.fiveMinutePregameLock
    ? "Each game locks 5 minutes before kickoff. Other games stay open until their own lock."
    : "Each game locks at its own kickoff. Other games stay open until they start.";
  return [
    lockLine,
    "At the same 1:00 PM ET Sunday moment, all games that have not started yet lock for picks (you cannot add or change picks for the rest of the week).",
    "Other players' picks appear for a game once that game locks.",
    NFL_OFFICE_SUNDAY_REVEAL_SENTENCE,
    NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE,
    PLATFORM_TUESDAY_OPENS_SENTENCE,
  ];
}
