---
name: NHL/NBA weekend platform rhythm
description: When calendar weekend pools open the next period vs crown a terminal Survivor winner.
---

**Tuesday 6:00 AM ET** — next pick sheet / `currentWeek` while the competition continues: NHL/NBA season Survivor (2+ alive), NHL weekly pick'em, Hit the Ice, NBA Fast Break, NBA ATS. Copy: `PLATFORM_TUESDAY_OPENS_SENTENCE` (and `NBA_WEEKEND_PICKS_OPEN_SENTENCE` for ATS). Backend: `platform-period.ts`, `calendar-survivor-platform-promotion.ts`, recurring rollover in `auto-eliminator.ts`.

**Day after clinching slate (ET)** — terminal closure only: season Survivor when exactly one entry remains alive after the week is finalized. NHL: Saturday slate → crown Sunday. NBA: Fri–Sun slate ends Sunday → crown Monday. No bogus next week (`advanceReadyCalendarSurvivorPeriods` skips ≤1 alive). Copy: `NHL_SURVIVOR_TERMINAL_WINNER_SENTENCE`, `NBA_SURVIVOR_TERMINAL_WINNER_SENTENCE`. Backend: `isCalendarSurvivorSoloWinnerDeclarationAllowed`, `shouldDeferCalendarSurvivorSoloWinnerClose`.

**Not the same:** weekly winners in pick'em / Hit the Ice / Fast Break — pool keeps going; Tuesday still applies.