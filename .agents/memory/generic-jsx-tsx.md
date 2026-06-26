---
name: Generic JSX in TSX files
description: Babel/Vite crashes on explicit generic type params on JSX elements; must rely on inference instead.
---

## Rule
Never write `<MyComponent<T> prop={...} />` in `.tsx` files — Babel's JSX parser treats `<T>` as a new JSX element and throws `Unexpected token`.

## Why
Babel's JSX transform does not distinguish between `<Component<Generic>` and a sibling JSX opening tag. This is a known limitation; TypeScript's own checker accepts it but Babel does not.

## How to apply
Drop the explicit generic and let TypeScript infer `TPlayer` (or whatever the type param is) from the typed `players` prop (or whichever prop carries the concrete type). For a generic component like:

```tsx
function Grid<T extends Base>({ players }: { players: T[] }) { ... }
```

The call site should be:
```tsx
// WRONG — crashes Babel
<Grid<MyType> players={items} />

// CORRECT — TypeScript infers T = MyType from the prop
<Grid players={items as MyType[]} />
```

If inference fails (e.g., the prop is `unknown[]`), cast at the call site instead of adding the explicit generic.
