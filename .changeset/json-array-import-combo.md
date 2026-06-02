---
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Add `@json(Type[] from "path")` combo form — import + array in a single
annotation.

The dogfood case from 0.1.4 (a `Json` column holding a typed array)
could be expressed two and a half ways before this:

- `@json(X)` — bare, requires the type to be importable in the
  consumer's global scope
- `@json(X from "path")` — single type with import, can't carry the
  `[]` shape
- `@json([X])` — DWIM-rewrites to `X[]` (since 0.1.4) but can't carry
  an import path

Workarounds were a per-field wrapper alias (`type Xs = X[]`) or a
global declaration tying the consumer to a prisma-json-types-style
convention. Neither is great.

`@polyprism/core`'s parser now accepts an optional `[]` suffix on the
type-name part of Form 2:

```prisma
/// @json(Tag[] from "./types/tag")
tags Json @default("[]")
```

The emitter imports the singular identifier (importing `Tag[]` would
be a syntax error — the brackets are a TS type-expression suffix, not
part of the identifier) and types the field as `Tag[]`.

IR change: `JsonAnnotation`'s `with-path` variant gains an optional
`isArray?: boolean` field. Optional, so the ten existing test fixtures
across the codebase that construct this variant continue to compile
without modification.

Patch bump across the fixed-version-locked group — the IR change is
strictly additive (existing consumers reading `with-path` IR continue
to work; the new field is optional) and we're in pre-1.0 prerelease.

Root README's `@json` section gains the canonical example.
