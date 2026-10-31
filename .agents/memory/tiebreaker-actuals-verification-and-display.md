---
name: Tiebreaker actuals verification and display
description: How tiebreaker guesses become verified actuals and what the UI/API shows (follow-up review for Molo)
---

**Status (Oct 2026):** Reminders and pick confirmations are done site-wide. **Next area to manually verify:** tiebreaker **actuals** (ESPN/box-score resolution) and how **guesses, actuals, and deltas** appear on leaderboards and pool views. Work started in pieces across pool types; behavior is not one unified module.

**Why this note:** Operators need to confirm “actual recorded → diff shown → winner resolved” per sport without re-discovering files each time.

---

## Concepts (same pattern, different stats)

| Layer | Meaning |
|--------|---------|
| **Guess** | Stored on `entries` (weekend pick’em / Crazy 8s) or type-specific tables (NFL weekly bonus → `nfl_weekly_tiebreakers`, NDP → division predictor tiebreakers, etc.) |
| **Target game** | Usually **last game on the slate/week** (NFL weekly bonus: latest kickoff in week — see `nfl-weekly-tiebreaker-collection.md`) |
| **Actual** | Fetched after the target is **unambiguously final** with complete stats; persisted on entry rows or tiebreaker rows |
| **Verification** | Background grading / closure in `auto-eliminator.ts`, plus `resolveNflWeeklyTiebreakerActuals()` for NFL weekly bonus |
| **Display** | API computes `actualsKnown`, `tiebreakerDiff*`, and **hides others’ guesses** until reveal rules say otherwise |

**Guess privacy vs actuals:** Opponents’ tiebreaker guesses follow the same “office pool” reveal timing as picks (`nfl-slate-reveal.ts`, `nhl-slate-reveal.ts`, `nba-slate-reveal.ts`): own row always visible; others after kickoff / Sunday 1 PM ET NFL office lock / `actualsKnown` / pool ended / sandbox.

---

## By pool type (where to look)

| Pool / tiebreaker | Stat(s) | Actual source (typical) | Persistence | Standings / UI |
|-------------------|---------|-------------------------|-------------|----------------|
| **Pick’em MLB weekly** | Runs (+ strikeouts secondary) | Last Sunday game + `fetchDailyStrikeouts` | Entry columns; graded in auto-eliminator | `pickem.ts` leaderboard: `tiebreakerActualRuns`, diffs; `PickEmView` / `PickEmTiebreakerCard` |
| **Pick’em NHL weekly** | Shots on goal (+ PIM collected, diff uses **SOG only**) | ESPN boxscore via NHL stats helpers | Entry columns | `nhl-tiebreaker-standings.ts` headers; `actualsKnown` when SOG actual set |
| **NBA ATS** | Combined points (last weekend game) | ESPN scores in closure loop | Entry `tiebreakerPoints` | Margin/diff on ended-pool leaderboard (see MEMORY link `nba-ats-margin-tiebreaker` — file may be missing; logic in auto-eliminator + pickem routes) |
| **NFL Pick’em season Wk 18** | Passing + rushing (season champion) | ESPN weekly tiebreaker fetch | Entry fields | `TiebreakerActualsCard`, confidence-style diffs when actuals exist |
| **NFL weekly bonus** (`pickem_season`, `nfl_confidence`, `weeklyBonusEnabled`) | Single **combined passing+rushing** guess | `fetchNflWeeklyTiebreakerActual` after final target game | `nfl_weekly_tiebreakers.actual` | `tiebreakerStatus`: `pending` / `resolved`; column `formatNflWeeklyPassingTiebreakerColumnHeader` |
| **NFL confidence weekly** | Passing (primary; rushing legacy cleared) | Same family as confidence grading | Entry columns | `nfl-confidence-weekly.ts` grid/leaderboard `actualsKnown`, `tiebreakerDiff1` |
| **NFL confidence season** | Wk 18 entry tiebreakers + optional weekly bonus | Grading + `resolveNflWeeklyTiebreakerActuals` | Mixed | `TiebreakerActualsCard`, weekly resolution payload |
| **Crazy 8s NHL / NBA / MLB** | SOG / points / runs (+ sport secondaries) | Period close in auto-eliminator + `crazy-eights.ts` yesterday-winner endpoint | Entry columns | Grid `actualsKnown`; PATCH tiebreaker after submit |
| **NDP / NHL NDP** | Division-wins style actuals | Commissioner simulate or live results | Predictor tiebreaker tables | Standings `tbActual`, `tiebreakerDiff` |
| **GSP / brackets** | N/A or bracket-specific | — | — | Not the same “last game combined stat” model |

---

## Verification pipeline (backend)

1. **Cron / auto-eliminator** (`artifacts/api-server/src/lib/auto-eliminator.ts`) — large sport-specific blocks: fetch final box scores, set actuals, resolve co-winners when pick scores tie.
2. **NFL weekly bonus resolver** — `nfl-weekly-tiebreaker-resolution.ts` → `resolveNflWeeklyTiebreakerActuals()`: groups rows with `actual IS NULL`, requires one target game per pool/week, sandbox uses `sandbox_game_scores`.
3. **Manual / admin paths** — NDP simulate stores AFC/NFC East win actuals (`ndp.ts`); sandbox replay rows can stand in for finals.
4. **Soft failure** — Many fetchers log and leave actual `null`; UI shows **TBD** / em dash until `actualsKnown` flips true.

---

## Display pipeline (frontend + API fields)

- **`actualsKnown`** — Boolean on leaderboard/grid payloads; when true, others’ guesses and diffs may show even if pool still active (see reveal helpers).
- **`visibleNflTiebreakerGuess` / `revealTiebreakerGuessForStandings`** — Null out guess in JSON when not revealed (client shows blank, not wrong number).
- **`TiebreakerActualsCard`** — Yellow card: actual PASS/RUSH (or labels), tied players with Δ columns (`TiebreakerActualsCard.tsx`).
- **`TiebreakerStandingsColumn` / `SingleStatTiebreakerPanel`** — Column headers embed actual in title, e.g. `BOS/NYY SOG (62)` via `formatNhlSogTiebreakerColumnHeader`.
- **Copy** — Shared phrases in `artifacts/survivor-sharks/src/lib/tiebreakerLabels.ts`.

---

## Manual QA checklist (when Molo reviews)

1. **Pick’em NHL weekly** — Submit SOG guess; after last Sunday game final, leaderboard shows actual SOG in header and Δ for tied top scores only.
2. **Pick’em MLB weekly** — Runs + K actuals both required for `tiebreakerActualsKnown`; confirm diff uses runs primary.
3. **NBA ATS** — Tie on correct picks; confirm combined points actual and winner after weekend final.
4. **NFL office pick’em / confidence** — Weekly bonus: guess hidden until Sunday 1 PM ET or target kickoff; `tiebreakerStatus` pending until ESPN actual written.
5. **Crazy 8s** — Locked picks + tiebreaker dialog; after period grade, grid shows actuals; recurring pools reset tiebreaker fields on rollover (`recurring-hit-the-ice-settlement.md`).
6. **Sandbox** — Reveal rules relaxed; actuals may come from replay rows — confirm display still matches sandbox scores.

---

## Key files (start here)

| Area | Path |
|------|------|
| NFL weekly actual job | `artifacts/api-server/src/lib/nfl-weekly-tiebreaker-resolution.ts` |
| NFL reveal + column labels | `artifacts/api-server/src/lib/nfl-slate-reveal.ts` |
| NHL/NBA reveal | `artifacts/api-server/src/lib/nhl-slate-reveal.ts`, `nba-slate-reveal.ts` |
| Pick’em leaderboard actuals | `artifacts/api-server/src/routes/pickem.ts` (search `tiebreakerActual`) |
| Crazy 8s actuals endpoint | `artifacts/api-server/src/routes/crazy-eights.ts` (~`yesterday-winner` / tiebreaker actuals comment) |
| Closure / fetch actuals | `artifacts/api-server/src/lib/auto-eliminator.ts` (search `tiebreaker actual`) |
| UI card | `artifacts/survivor-sharks/src/components/TiebreakerActualsCard.tsx` |
| Related design | `.agents/memory/nfl-weekly-tiebreaker-collection.md` |

---

## Related open items

- Confirm production has migrations for `nfl_weekly_tiebreakers` and any sport-specific entry columns (`drizzle-migration-drift.md`).
- Restore or recreate `nba-ats-margin-tiebreaker.md` if that doc was dropped — closure behavior still lives in code.
- No automated cross-pool test suite for “actual displayed”; rely on sport-specific tests (`nfl-weekly-tiebreaker-resolution.test.ts`, `nhl-tiebreaker-standings.test.ts`, etc.) plus manual QA above.
