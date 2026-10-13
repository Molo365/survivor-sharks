# NFL beta audit (all five create-wizard types)

**Decision:** Offer all NFL pool types at domain beta. Keep sport `nfl` **open** in admin when `POOL_CREATION_OPEN=true`.

## Types in Create Pool (`SPORT_POOL_TYPES.nfl`)

| poolType | Label | Beta go | Smoke focus |
|----------|-------|---------|-------------|
| `season` | Survivor Season | **Go** | Pick → lock at kickoff → elimination → week advance (live); preseason flag at create |
| `pickem_season` | NFL Pick-Ems Season | **Go** | Straight + ATS; Live board; Wk 18 season tiebreaker; final **ties** must not leave pending rows |
| `nfl_confidence` | Confidence — Season | **Go** | Confidence assignment; Live board; Wk 18 season closure |
| `nfl_confidence_weekly` | Confidence — Weekly | **Go** | Per-week winner; recurring rollover; weekly closure in auto-eliminator |
| `nfl_division_predictor` | Division Predictor | **Go (pre-kickoff only)** | Pre-season picks; locks at regular-season kickoff; **sandbox** for admin demos mid-season |

Legacy (not in wizard): `weekly`, `mid_season` survivor — existing pools only.

## Engineering notes

- **NDP create guard:** `POST /api/pools` rejects live `nfl_division_predictor` when `getNdpLockState` is locked (parity with NHL). Sandbox pools bypass. Create Pool shows the type grayed out with “See you next season!” when locked (`GET /api/nfl/ndp-lock`); admins with Sandbox Mode on can still create live.
- **Weekly bonus tiebreaker:** Only `pickem_season` + `nfl_confidence` when `weeklyBonusEnabled`; separate from Wk 18 season tiebreaker (`nfl-weekly-tiebreaker-collection` memory).
- **Pick visibility:** Opponent picks at kickoff / after grade (`pick-visibility-timing` memory).
- **NFL week advance:** Preseason + regular require ESPN slate validation (`nfl-preseason-advancement` memory).

## Pre-domain smoke checklist (production URL)

For each type you will expose: create (or join) → invite → join → submit picks → verify live/leaderboard after one graded game.

1. Survivor `season` — one pick, wrong/right path  
2. `pickem_season` straight — full week slate  
3. `pickem_season` ATS — spreads present, cover grades  
4. `nfl_confidence` — rank all games for current week  
5. `nfl_confidence_weekly` — same, confirm week resets if recurring  
6. `nfl_division_predictor` — only if before lock; else sandbox admin pool  

## Known UX gaps (non-blocking)

- Create wizard `season` card template text is NHL-specific; NFL copy is applied in the type-selection step override.
