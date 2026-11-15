---
name: NHL weekend platform rhythm
description: When NHL weekend pools open the next period vs crown a terminal winner.
---

**Tuesday 6:00 AM ET** — next pick sheet / `currentWeek` for ongoing NHL weekend products while the competition continues: season Survivor (2+ alive), recurring weekly pick'em, Hit the Ice (crazy_8s). Copy: `PLATFORM_TUESDAY_OPENS_SENTENCE` in `platformWeekCopy.ts`. Backend: `platform-period.ts`, `calendar-survivor-platform-promotion.ts`, NHL recurring rollover in `auto-eliminator.ts`.

**Day after clinching slate (ET)** — terminal closure only: NHL season Survivor when exactly one entry remains alive after the week is finalized (Saturday slate → crown Sunday). Do not open a bogus next week (`advanceReadyCalendarSurvivorPeriods` skips ≤1 alive). Copy: `NHL_SURVIVOR_TERMINAL_WINNER_SENTENCE`. Backend: `isCalendarSurvivorSoloWinnerDeclarationAllowed`, `shouldDeferCalendarSurvivorSoloWinnerClose`.

**Not the same:** weekly pick'em / Hit the Ice weekly winners — pool keeps going; Tuesday still applies. NBA weekend products: evaluate separately; Survivor/NBA already mirrors calendar logic in code.