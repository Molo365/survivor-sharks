/** User-facing copy for NFL office-pool pick visibility (excludes division predictor). */

import { PLATFORM_TUESDAY_OPENS_SENTENCE } from "./platformWeekCopy";

export const NFL_OFFICE_SUNDAY_REVEAL_SENTENCE =
  "At 1:00 PM ET on the week's main Sunday, everyone's picks for that week become visible—including games that have not kicked off yet (such as Monday night).";

/** Pick'em season: Sunday 1 PM office lock (welcome + rules). */
export const NFL_PICKEM_SEASON_SUNDAY_POOL_LOCK_SENTENCE =
  "At 1:00 PM ET on Sunday, the pool locks completely and all picks become visible (including Monday night).";

/** Short welcome panel only; full detail stays in pool rules. */
export function nflPickemSeasonWelcomeBlurb(): string {
  return (
    "Pick the winner of every NFL game each week. Points accumulate all season — whoever has the most correct picks after Week 18 wins. " +
    `${NFL_PICKEM_SEASON_SUNDAY_POOL_LOCK_SENTENCE} ` +
    "In Week 18, enter a combined passing-yards tiebreaker on the last game to settle any ties. Good luck! 🦈🏈"
  );
}

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
  if (opts.fiveMinutePregameLock) {
    return [
      "Each game locks 5 minutes before kickoff until the Sunday office moment below.",
      "At the same 1:00 PM ET Sunday moment, all games that have not started yet lock for picks (you cannot add or change picks for the rest of the week).",
      "Other players' picks appear for a game once that game locks.",
      NFL_OFFICE_SUNDAY_REVEAL_SENTENCE,
      NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE,
      PLATFORM_TUESDAY_OPENS_SENTENCE,
    ];
  }
  return [
    NFL_PICKEM_SEASON_SUNDAY_POOL_LOCK_SENTENCE,
    NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE,
    PLATFORM_TUESDAY_OPENS_SENTENCE,
  ];
}
