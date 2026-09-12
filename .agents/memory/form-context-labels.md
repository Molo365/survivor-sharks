---
name: Form context labels
description: React form primitives that depend on FormField/FormItem context
---

`FormLabel`, `FormDescription`, `FormControl`, and `FormMessage` call `useFormField()` and must be rendered inside the matching `FormField` and `FormItem` context. A decorative section heading or help paragraph is not a form field; use ordinary semantic elements there, or wrap the actual setting in a real `FormField`.

**Why:** Rendering a context-dependent form primitive outside its provider throws during React render and can blank the entire wizard without an ErrorBoundary.

**How to apply:** When adding wizard sections, audit every form primitive's ancestry. Use `FormLabel` only for a registered field; use `div`, `p`, or the base `Label` component for standalone headings and descriptions.