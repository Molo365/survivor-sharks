---
name: Aliased boolean condition narrowing (TS2367)
description: A const boolean gate can silently narrow a union member out of variables it references, making later comparisons "unintentional".
---

When a `const` boolean (e.g. `hasOptions`) is defined in terms of a watched
union value (e.g. `selectedType = form.watch("poolType")`) and then used to gate
a JSX/if block, TypeScript's aliased-condition control-flow analysis narrows the
union *inside that block* to only the members that could make the boolean true.

**Symptom:** a comparison inside the gated block like `selectedType !== "weekly"`
throws `TS2367: This comparison appears to be unintentional ... have no overlap`,
and the reported union is missing exactly the member(s) that only ever appear as
*exclusions* (`!== "weekly"`) and never as *inclusions* (`=== "weekly"`) in the
boolean's definition.

**Why:** if a union member never appears on the "truthy" side of the gate's
definition, TS proves it cannot reach the block, so it removes it from the type.
The redundant `!==` check then has no overlap.

**How to apply:** drop the now-redundant comparison inside the block (it is also
dead at runtime — the gate guarantees it). Do NOT try to "fix" it by casting; the
narrowing is correct. This is distinct from ordinary control-flow narrowing after
`if`/early-return — here the trigger is a *named const boolean* used as the
condition.
