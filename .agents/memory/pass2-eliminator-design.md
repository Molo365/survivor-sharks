---
name: Pass 2 auto-eliminator design
description: Correct algorithm for Pass 2 of the auto-eliminator (multi-life survivor pools); documents the two bugs in the "most recent pick" approach and the replacement.
---

## The rule

Pass 2 must walk every alive player's full pick history in week order and find the **first week where cumulative losses exceed maxStrikes**. That week is `violatingWeek` and becomes `eliminatedWeek`.

**Why:** The "anchor to most recent graded pick" approach has two confirmed failure modes for multi-life pools (e.g. NHL Season, maxStrikes=2):
1. **Blind spot** — if latest pick is a win, the player never enters the candidate set even if they exceeded the cap in an earlier week.
2. **Wrong eliminatedWeek** — if the player's latest pick is a loss but they exceeded the cap in an earlier week, the old code stamps the wrong (later) week.

## Implementation (current)

Two flat queries + in-memory walk, inside `processNonMlbPools()`:

- **Query 1**: all `status="alive"` entries in eligible (non-mlb, non-weekly, isActive) pools.
- **Query 2**: all graded (non-pending) picks for those pool IDs, left-joined against `weekResultsTable` to exclude voided weeks, ordered `(poolId, userId, week ASC)`.
- **Group** by `poolId:userId` into a Map.
- **Walk** per candidate: accumulate running `lossCount`; first week where `lossCount > maxStrikes` → `violatingWeek`.
- If `violatingWeek` found → `UPDATE entries SET status="eliminated", eliminatedWeek=violatingWeek WHERE status="alive"`.
- If not found → skip (correctly alive).

## maxStrikes derivation

`(sport === "nhl" && poolType === "season") ? 2 : 0`

Single-life pools (maxStrikes=0): first loss week is the violating week (lossCount=1 > 0).

## Verified against pool 69 real sequences

| Player | Sequence (W1–W6) | violatingWeek |
|--------|-----------------|---------------|
| Real A | W,L,L,L,L,L    | 4             |
| Real B | W,L,L,W,L,L    | 5             |
| Real C | W,L,L,W,W,L    | 6             |
| Real D | L,L,L,W,W,W    | 3 (was blind spot) |

**How to apply:** Any future expansion of multi-life rules (e.g. NBA Season with 3 lives) only needs `maxStrikes` updated in the derivation — the walk logic is generic.
