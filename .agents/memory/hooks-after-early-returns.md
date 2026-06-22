---
name: Hooks after early returns
description: useState/useCallback placed after isLoading/null-guard returns violates Rules of Hooks and causes blank-screen crashes with no ErrorBoundary.
---

## The rule

All hook calls (`useState`, `useCallback`, `useMemo`, etc.) must appear **before** any conditional early return. React tracks hooks by call order; if a hook is skipped on one render (because the early return fired) and called on the next (because it didn't), React throws "Rendered more hooks than during the previous render."

**Why:** This was the root cause of the intermittent blank-screen bug on the Standings tab in `SurvivorStandings.tsx`. `useState<number|null>(null)` sat after the `if (isLoading)` skeleton return and the `if (!leaderboard) return null` guard. First render skipped it; second render hit it → hook-count mismatch → crash. No ErrorBoundary in the tree → entire page blanked.

**How to apply:**
- Any component that has early returns (loading state, null-guard, permission check) must hoist ALL hooks to the very top of the function body.
- The correct pattern (already used in `Leaderboard.tsx` line 11) is: hooks first, guards second.
- As a secondary defence, consider adding a top-level `ErrorBoundary` wrapping tab content so a single component crash doesn't blank the whole page.
