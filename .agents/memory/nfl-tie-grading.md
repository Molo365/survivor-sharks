---
name: NFL tie grading
description: Final NFL tie games can leave confidence or Pick-Em rows pending unless tie outcomes are handled explicitly.
---

Treat a completed NFL tie as a resolved outcome: team picks do not earn a win, Survivor picks are losses, and confidence/Pick-Em picks should not remain pending. Keep any historical repair pool-scoped and fail closed unless the exact ESPN season, type, week, event, and final scores are verified.

**Why:** The normal winner-map grading path excludes tied games, and a real preseason tie left historical pending rows that blocked safe pool closure.

**How to apply:** When adding or changing NFL grading or closure logic, test final ties separately from unfinished or unscored games, and preserve an explicit opt-in for historical reconciliation.