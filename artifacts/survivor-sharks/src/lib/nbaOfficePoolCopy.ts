/** User-facing copy for NBA weekend office pools (ATS pick'em + Fast Break). */

import { NBA_WEEKEND_PICKS_OPEN_SENTENCE, PLATFORM_TUESDAY_OPENS_SENTENCE } from "./platformWeekCopy";

export const NBA_WEEKEND_SATURDAY_LOCK_SENTENCE =
  "The pool locks Saturday at 6:00 PM ET. Games that already started cannot be picked or changed.";

export const NBA_WEEKEND_REVEAL_SENTENCE =
  "At that same moment, everyone's picks and tiebreaker guesses for the weekend become visible.";

export const NBA_WEEKEND_ATS_VISIBILITY_NOTICE =
  `Pick up to 12 games per weekend once ESPN posts the spread. You can add or change picks on any open game until Saturday 6:00 PM ET. ${NBA_WEEKEND_SATURDAY_LOCK_SENTENCE} ${NBA_WEEKEND_REVEAL_SENTENCE}`;

export function nbaWeekendAtsLockAndVisibilityRules(): string[] {
  return [
    "Each game locks five minutes before tip-off once it has started.",
    NBA_WEEKEND_PICKS_OPEN_SENTENCE,
    PLATFORM_TUESDAY_OPENS_SENTENCE,
    NBA_WEEKEND_SATURDAY_LOCK_SENTENCE,
    "After lock, you cannot add or change picks for the rest of the weekend.",
    NBA_WEEKEND_REVEAL_SENTENCE,
  ];
}
