/** User-facing copy for NBA weekend office pools (ATS pick'em + Fast Break). */

export const NBA_WEEKEND_SATURDAY_LOCK_SENTENCE =
  "The pool locks Saturday at 6:00 PM ET. Games that already started cannot be picked or changed.";

export const NBA_WEEKEND_REVEAL_SENTENCE =
  "At that same moment, everyone's picks and tiebreaker guesses for the weekend become visible.";

export const NBA_WEEKEND_ATS_VISIBILITY_NOTICE =
  `You can add or change picks on any game that has not started yet until Saturday 6:00 PM ET. ${NBA_WEEKEND_SATURDAY_LOCK_SENTENCE} ${NBA_WEEKEND_REVEAL_SENTENCE}`;

export function nbaWeekendAtsLockAndVisibilityRules(): string[] {
  return [
    "Each game locks five minutes before tip-off once it has started.",
    "The pick sheet opens Monday ET when spread lines are typically posted for that Fri–Sun weekend.",
    NBA_WEEKEND_SATURDAY_LOCK_SENTENCE,
    "After lock, you cannot add or change picks for the rest of the weekend.",
    NBA_WEEKEND_REVEAL_SENTENCE,
  ];
}
