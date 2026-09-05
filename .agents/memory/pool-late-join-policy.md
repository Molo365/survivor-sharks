---
name: Pool late-join policy
description: Product and reliability rules for deciding whether an in-progress pool can accept a new member.
---

Survivor variants must reject new members once their authoritative schedule, sandbox replay, lock resolver, grading, elimination, or progression state proves the pool started. Non-Survivor pools remain joinable after start and show a disadvantage warning instead.

**Why:** A submitted pick may exist before kickoff, so treating any submission as start evidence closes pools prematurely. Conversely, provider outages must not reopen a Survivor pool when persisted grading or progression already proves play began.

**How to apply:** Keep invite preview and write-time join enforcement on the same start-state policy, but always recompute at POST time. New sports need a schedule/lock adapter plus definitive persisted evidence; provider uncertainty alone must leave a brand-new pool joinable.