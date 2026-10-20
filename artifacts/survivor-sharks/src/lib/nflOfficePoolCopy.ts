/** User-facing copy for NFL office-pool pick visibility (excludes division predictor). */

import { PLATFORM_TUESDAY_OPENS_SENTENCE } from "./platformWeekCopy";

export const NFL_OFFICE_SUNDAY_REVEAL_SENTENCE =
  "At 1:00 PM ET on the week's main Sunday, everyone's picks for that week become visible—including games that have not kicked off yet (such as Monday night).";

/** Pick'em season: the main weekly deadline members should remember. */
export const NFL_PICKEM_SEASON_SUNDAY_SLATE_LOCK_SENTENCE =
  "At 1:00 PM ET on the week's main Sunday, the full weekly slate locks — you cannot add or change picks for any game that has not started yet (including Monday night), and everyone's picks for that week become visible.";

export const NFL_PICKEM_SEASON_EARLY_KICKOFF_LOCK_SENTENCE =
  "Games that kick off before that Sunday 1:00 PM moment (Thursday, Saturday, or early Sunday) lock when they start.";

/** Short welcome panel only; full detail stays in pool rules. */
export function nflPickemSeasonWelcomeBlurb(): string {
  return (
    "Pick every NFL game each week—the most correct picks after Week 18 wins the season. " +
    "At 1:00 PM ET on the main Sunday, the weekly slate locks and everyone's picks become visible (including Monday night). " +
    "Games that already kicked off earlier in the week locked when they started. " +
    "Week 18: passing-yards tiebreaker on the last game for ties. Good luck! 🦈🏈"
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
    NFL_PICKEM_SEASON_SUNDAY_SLATE_LOCK_SENTENCE,
    NFL_PICKEM_SEASON_EARLY_KICKOFF_LOCK_SENTENCE,
    NFL_OFFICE_INCOMPLETE_SLATE_SENTENCE,
    PLATFORM_TUESDAY_OPENS_SENTENCE,
  ];
}
