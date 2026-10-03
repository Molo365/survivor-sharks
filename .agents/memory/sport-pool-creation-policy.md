---
name: Per-sport pool creation policy
description: Scope and admin bypass requirements for per-sport availability controls.
---

Per-sport availability (`open`, `coming_soon`, or `paused`) controls NEW pool creation by non-admins only. It must never disable or alter existing pools, and admins always bypass it. Keep this independent of the global `POOL_CREATION_OPEN` flag.

**Why:** The user explicitly specified creation-only scope and the same admin bypass as the existing global flag.

**How to apply:** Preserve these boundaries when adding admin toggle controls or wizard status displays. Missing sport rows default to open.