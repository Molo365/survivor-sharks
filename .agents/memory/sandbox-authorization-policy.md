---
name: Sandbox authorization policy
description: Product authorization boundary for sandbox controls, simulations, manual results, and intentional commissioner exceptions.
---

All sandbox creation, sandbox-mode changes, sandbox week/replay controls, and simulated grading or standings operations are admin-only. Manual Survivor result submission is also admin-only, including its real-data auto-fetch option.

**Why:** Sandbox and manual result operations can alter standings, eliminations, closure, and payouts in pools with real users and real money. Pool ownership does not grant authority to perform these operations.

**How to apply:** Require the existing admin middleware on every new sandbox or simulation route and separately verify the target pool is sandbox-enabled before mutation. Commissioners may still send pool broadcasts, trigger ESPN-backed Pick-Em result processing, manage NBA ATS spread lines, and trigger ESPN-backed NFL Pick-Em Season processing.