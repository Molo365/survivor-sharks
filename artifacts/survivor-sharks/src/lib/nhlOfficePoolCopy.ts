/** User-facing copy for NHL weekend office pools (weekly pick'em + Hit the Ice). */

import { PLATFORM_TUESDAY_OPENS_SENTENCE } from "./platformWeekCopy";

export const NHL_WEEKEND_SATURDAY_LOCK_SENTENCE =
  "The pool locks Saturday at 7:00 PM ET. Games that already started cannot be picked or changed.";

export const NHL_WEEKEND_REVEAL_SENTENCE =
  "At that same moment, everyone's picks and tiebreaker guesses for the weekend become visible.";

export const NHL_WEEKEND_PICKEM_VISIBILITY_NOTICE =
  `You can add or change picks on any game that has not started yet until Saturday 7:00 PM ET. ${NHL_WEEKEND_SATURDAY_LOCK_SENTENCE} ${NHL_WEEKEND_REVEAL_SENTENCE}`;

export function nhlWeekendPickemLockAndVisibilityRules(): string[] {
  return [
    "Each game locks at puck drop once it has started.",
    PLATFORM_TUESDAY_OPENS_SENTENCE,
    NHL_WEEKEND_SATURDAY_LOCK_SENTENCE,
    "After lock, you cannot add or change picks for the rest of the weekend.",
    NHL_WEEKEND_REVEAL_SENTENCE,
  ];
}
