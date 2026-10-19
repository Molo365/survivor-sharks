---
name: MLB weekly tiebreaker parity (backlog)
description: Shelved until MLB Pick'em returns (~next season). Do not delete existing MLB tiebreaker; do not build NHL-parity UX until then unless product reopens MLB.
---

MLB weekly Pick'em **already works** at a basic level: combined **runs** on the last game of the week, dialog on submit (last day / sandbox rules), `entries.tiebreaker_runs`, closure in auto-eliminator. It does **not** match live NHL weekly (#93–#97): no yellow standings column, guesses hidden until kickoff (`revealTiebreakerGuessForStandings` — only NHL weekly shows pre-kickoff), no mandatory submit gate + API reject for Sunday/last-day without runs.

**Product:** MLB creation is off until next season; **do not** spend eng on parity until pre-season unless explicitly requested.

**When reopening MLB, mirror NHL weekly (reference `main` after PR #97):**

1. **Contract:** One stat (runs only), last game of week, office-pool column visible once saved, split on equal distance.
2. **UI (`PickEmView`):** Same flow as `isLiveNhlWeekly` but for live MLB weekly — modal required when submitting last-day picks without `tiebreakerRuns`; no split-save across days; recovery modal if picks exist without runs.
3. **API (`pickem.ts`):** Reject last-day slate picks without `tiebreakerRuns` when entry has none (extract shared helper from `nhl-weekly-tiebreaker-submit.ts`).
4. **Standings:** Reuse `TiebreakerStandingsColumn` + header from leaderboard (extend `revealTiebreakerGuessForStandings` with `isMlbWeeklyPickemPool` pre-kickoff reveal if product wants Poolhost-style).
5. **Remove** redundant footer `PickEmTiebreakerCard` on weekly leaderboard when column exists (same as NHL #94).
6. **QA:** Sandbox weekly + one live week smoke.

**Do not remove** MLB tiebreaker columns, dialog, or eliminator logic while shelved — test pools and sandbox may still use them.
