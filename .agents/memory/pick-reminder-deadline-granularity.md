---
name: Pick reminder deadline granularity
description: The deadline and deduplication rules for partial-pick reminder scheduling.
---

Per-game Pick-Em formats should resolve reminders from each user’s next open, unpicked game. Whole-slate and single-selection formats should continue using one pool-period deadline.

**Why:** A weekly deadline based only on the first kickoff stops reminders after an early game, even when a user still has valid later picks. Claiming by exact game set is unstable when schedules change and can duplicate notifications.

**How to apply:** Use one claim identity per pool period, Eastern pick-date, and reminder stage. This permits separate Thursday and Sunday cycles while suppressing duplicate same-day reminders after partial picks, postponements, or schedule changes.