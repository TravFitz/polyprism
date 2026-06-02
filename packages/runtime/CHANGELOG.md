# @polyprism/runtime

## 0.1.5

### Patch Changes

- 9adb1e9: Add `@json(Type[] from "path")` combo form — import + array in a single
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

## 0.1.4

### Patch Changes

- 8d102f1: Fix `@json([Type])` silently emitting a tuple-of-one TypeScript type.

  A user dogfooding `@polyprism/ts-domain-class` against a real production
  schema (with a `Json` column meant to hold an array) reached for the
  natural-feeling syntax `/// @json([CountryConfiguration])` after reading
  the README's mention of the `/// [TypeName]` line-level shorthand. The
  parser was passing `[CountryConfiguration]` straight through as a Form 3
  inline-anonymous type expression, which TypeScript reads as a
  single-element tuple — silently corrupting any consumer that mapped,
  pushed, or filtered over more than one element.

  `@polyprism/core`'s `parseJsonArgs` now detects the
  `@json([SingleIdent])` pattern, DWIM-rewrites it to
  `@json(SingleIdent[])` (the user's almost-certain intent — array of X),
  and pushes a parse-time warning into `AnnotationSet.parseIssues`.
  Multi-element bracket forms (`@json([A, B])`) pass through unchanged
  because they're legitimate tuple literals. The trailing-comma form
  `@json([X, ])` is the escape hatch for the rare genuinely-tuple-of-one
  case.

  The warning surfaces in `@polyprism/ts-domain-class` output today via
  the renderer's issue collector. Surfacing parse issues in
  `ts-interface` / `ts-type` / `ts-class` output is a known follow-up
  (`packages/ts-shared/src/render-model.ts:46-48` already calls this
  out as deferred); those consumers get the silently-correct
  DWIM-rewritten type for now.

  Root README's `@json` section gains an explicit example documenting the
  array form (`@json(Tag[])`) so future readers don't fall into the same
  trap.

  No code changes outside `@polyprism/core`'s parser + tests + the root
  README; every other published package patches under the fixed-version
  lockstep rule.

## 0.1.3

### Patch Changes

- f6554a5: Sanity-audit follow-ups before the shopify-duty-tax dogfood: two real
  runtime bugs and a handful of lying-doc / cosmetic fixes surfaced by a
  fresh-eyes review pass.

  **Runtime fixes (`@polyprism/runtime`)**

  - `coerceFloat` no longer silently accepts garbage-tail strings like
    `"5.5abc"` (which `Number.parseFloat` was parsing as `5.5`). Switched
    to `Number()` + an empty-string guard, mirroring the `coerceInt`
    rewrite. Setter contract is now consistent: a Float-typed field
    rejects any string that isn't fully a valid number.
  - `coerceBigInt("")` and `coerceBigInt("   ")` no longer return `0n`
    (which `BigInt("")` does natively — spec behaviour, but lethal as a
    silent coercion). An empty-string id from a boundary payload now
    throws instead of becoming a legitimate-looking zero.

  **Lying-doc fixes**

  - `@polyprism/ts-domain-class` README and `src/index.ts` no longer claim
    `from()`, `toJSON()`, and `builder()` are "post-rc.1 / post-rc.2 / in
    release-candidate flow" — those features have shipped since the first
    publish but the docs hadn't caught up. The npm landing page now
    reflects what's actually available.
  - The annotation count across `core`, `ts-interface`, `ts-type`,
    `ts-class`, and root `README.md` was "seven" but the parser supports
    eight (`@noCoerce` was added without updating the enumeration).
    Updated count + added `@noCoerce` to each list.
  - Generated `from()` JSDoc no longer points consumers at `@polyprism/ts-zod`
    (which isn't on npm yet — anyone searching gets a 404). Softened to "a
    Zod-based runtime validation pattern is planned for a future release".
  - Added a paragraph to the `from()` JSDoc explicitly noting that setters
    can still throw `TypeError` on uncoercible values, even though `from()`
    itself doesn't validate.
  - Root `README.md` roadmap table previously said v0.3 would add
    `ts-domain-class`. It's at v0.1 already; rewrote the table.

  **Renderer polish**

  - Nullable strict pass-through setters no longer emit the cosmetic
    no-op wrap `this.#x = v === null ? null : v;`. Now emits `this.#x = v;`
    directly. Wraps still emit when the setter actually has runtime work
    (coerce or normalise).
  - Required + prisma-assigned field getters (`@default(cuid())`,
    `@default(now())`, `@default(autoincrement())`, etc.) now carry an
    `@remarks` JSDoc tag explaining that the declared type is honest
    post-insert but reads on a freshly-constructed instance return
    `undefined`. IDE hovers surface the contract; runtime behaviour
    unchanged (the toJSON defensive design depends on the graceful
    undefined path, so we deliberately don't make the getter throw).

## 0.1.2

## 0.1.1
