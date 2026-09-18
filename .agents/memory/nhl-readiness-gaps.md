---
name: NHL readiness gaps
description: NHL production readiness checks that are not covered by the current typecheck and unit-test suite.
---

NHL readiness requires checking product semantics separately from shared grading tests: recurring NHL Pick-Em pools still have no rollover path. There is no NHL-specific confidence pool, and the forced-recurring Hit The Ice setting conflicts with the shared Crazy 8s resolver closing the pool after one period.

**Why:** Shared tests validate helper behavior and settlement policy, but do not exercise a real NHL scheduler cycle or the full recurring pool lifecycle.

**How to apply:** Before enabling recurring NHL pools for real users, add and verify a rollover policy modeled on the sport's actual Sat–Sun slate. Also decide whether NHL Confidence is a new pool type or Hit The Ice terminology, reconcile Hit The Ice's intended recurring/one-week lifecycle, and run an ESPN preseason/regular-season fixture probe when season handling changes.