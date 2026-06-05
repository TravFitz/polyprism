# @polyprism/ts-domain-class

## 0.2.0

### Minor Changes

- e7cf2ff: Add the PHP emitter family — first non-TypeScript target.

  **Two new pattern packages**:

  - `@polyprism/php-class` — PHP 8.1+ `final class` with public typed properties via constructor property promotion. Mutable; properties can be reassigned after construction.
  - `@polyprism/php-readonly` — PHP 8.2+ `final readonly class` value objects. Same shape but immutable after construction.

  Both build on a new `@polyprism/php-shared` rendering layer, mirroring how the TS family shares `@polyprism/ts-shared`.

  **What's in the box**:

  - Full scalar mapping (`String → string`, `Int → int`, `Float → float`, `Boolean → bool`, `DateTime → \DateTimeImmutable`, `BigInt → int`, `Decimal → string`, `Json → mixed`, `Bytes → string`).
  - PHP 8.1+ backed enums (`enum X: string`) for every Prisma enum.
  - Cross-file relations via PSR-4 `use` statements, with self-references and same-namespace references short-circuiting cleanly.
  - PHP defaults for literal scalars, enum cases, and `now()` (`new \DateTimeImmutable()`); `cuid()`/`uuid()` defaults become required constructor arguments.
  - Constructor parameters are sorted required-first, optional-second — PHP 8.4-deprecation safe.
  - Annotation support: `@hide`, `@deprecated`, `@name`, `@type`, `@json` (see "Typed JSON columns" below). `@coerce`/`@normalise`/`@noCoerce` are recognised but ignored in v0 (deferred to a future `@polyprism/php-domain-class` with PHP 8.4 property hooks).

  **Typed JSON columns** via `@json(...)`:

  - Inline-named (`/// @json(BillingAddress = { street: string, city: string })`) and inline-anonymous (`/// @json({ ... })`) forms emit a `final readonly class` under `<outputDir>/JsonTypes/<Name>.php`. The Json field on the parent model is typed as that class (with a `use` statement registered cross-namespace).
  - Supported v0 TS subset inside `@json` shapes: primitives (`string`, `number → float`, `boolean`, `unknown`/`any → mixed`), optional fields (`name?: type`), arrays of primitives (`tags: string[]` → PHP `array` + PHPDoc `array<int, T>`), and nested objects (PHPDoc `array{...}` shape on a plain `array` property — no sub-class spawning).
  - Unsupported shapes (unions, generics, identifier references inside an inline shape) warn + fall back to `mixed`. Use `@type("\\App\\YourType")` to point at a hand-written PHP class for richer typing.
  - Bare (`@json(SomeType)`) and with-path (`@json(SomeType from "./path")`) forms warn + fall back to `mixed` — these rely on TS module imports with no PHP autoloading equivalent.
  - Auto-naming collisions (two different shapes resolving to the same class name) emit a warning identifying both source fields.

  **Verified Composer-compliant.** Every push to this repo runs four PHP-side gates against the committed showcase output: `php -l` under both PHP 8.1 (the php-class floor) and 8.2 (the php-readonly floor); `composer dump-autoload --strict-psr` to verify file/namespace/directory layout; a smoke script that autoloads through Composer, instantiates every generated class, exercises `final readonly` enforcement, verifies `@hide` actually omits the field from the constructor signature, and round-trips `json_encode`; and a drift check that regenerates the showcase and fails if the output differs from the committed version.

  The packages emit under `<outputDir>/Models/<ClassName>.php`, `<outputDir>/Enums/<EnumName>.php`, and `<outputDir>/JsonTypes/<Name>.php`. Consumers wire the generated dir into `composer.json` autoload with a single psr-4 entry (default root namespace: `Generated\\`).

  This release is a coordinated minor across the @polyprism/\* fixed-version group; non-PHP packages contain no functional changes.

### Patch Changes

- Updated dependencies [e7cf2ff]
- Updated dependencies [edbd579]
  - @polyprism/core@0.2.0
  - @polyprism/ts-shared@0.2.0

## 0.1.7

### Patch Changes

- 65b2b4b: Hot-fix for `@polyprism/runtime@0.1.6`: the CJS sibling crashed under
  ts-jest with `Unexpected token 'export'`.

  **The bug.** tsup with `bundle: false` + multi-entry preserved the
  source-level `from "./coerce.js"` literals in the CJS output as
  `require("./coerce.js")` — pointing at the ESM-format `.js` siblings
  instead of the `.cjs` ones. With the package's `"type": "module"`,
  those `.js` files are ESM. Node-as-CJS resolving the require chain
  hit `export { ... }` syntax and choked.

  Node 22's experimental `require(esm)` support masked the failure on
  the maintainer's dev machine (which is how it shipped in 0.1.6 despite
  the cjs-load test passing locally). ts-jest and any other strict CJS
  context — Mocha-without-loader, Node 20, Node 22 with the flag off —
  all hit the syntax error at module load.

  **The fix.** Switch tsup to `bundle: true` with a single
  `entry: ["src/index.ts"]`. Bundling per format inlines coerce +
  normalise into each output (`dist/index.js` + `dist/index.cjs`),
  eliminating internal requires entirely. The runtime is ~70 LOC; the
  tree-shakeability cost is negligible (bundled size: 3.41 KB CJS /
  2.23 KB ESM), and modern bundlers still tree-shake the ESM named
  exports on the consumer side.

  **The regression gate.** New file-content assertion in
  `packages/runtime/tests/cjs-load.test.ts` greps the bytes of
  `dist/index.cjs` for any internal `require("./...")` calls and
  asserts the match array is empty. The previous "does it load?" test
  PASSED on Node 22 with `require(esm)` enabled — so this regex gate
  runs against the published bytes independent of host Node version,
  catching the regression class at source.

  **Framing softened**: runtime's README and package.json description
  shift from "Dual ESM + CJS" to "ESM-first, with a CJS sibling for
  legacy test runners". ESM stays the primary contract; CJS is the
  escape hatch for ts-jest / Mocha-without-loader. The other six
  `@polyprism/*` packages remain pure ESM (they ship generator bins
  Prisma spawns out-of-process — no consumer ever `require()`s them).

  Patch bump across the fixed-version-locked group.

- Updated dependencies [65b2b4b]
  - @polyprism/core@0.1.7
  - @polyprism/ts-shared@0.1.7

## 0.1.6

### Patch Changes

- e802ca8: Two consumer-reported bugs from the shopify-duty-tax dogfood of
  `@polyprism/ts-domain-class@0.1.5`.

  **Bug 1: nullable + `@default(now()/cuid()/etc)` fields silently
  null-clobbered by Prisma writes (data-loss class).** Earlier in the
  session I introduced an "ALL nullable fields initialise to null" rule
  with the well-meaning goal of making the runtime value match the
  declared `T | null` type. For nullable + prisma-assigned defaults
  (`DateTime? @default(now())`, `String? @default(cuid())`, etc.), that
  rule broke Prisma's null-vs-undefined contract: explicit null in
  `data:` means "force null, ignore the schema default." Every
  `prisma.x.create({ data: instance })` against a nullable-with-default
  field would silently null-clobber the column, defeating
  `@default(now())` and friends.

  The fix in `packages/ts-shared/src/render-domain-class.ts` narrows the
  "= null" emit to nullable fields **without** a prisma-assigned
  function-default. Nullable + no-default keeps `= null` (correct — user
  intent is null when unset). Nullable + literal-default keeps `= null`
  (correct — the constructor's init-assignment line overrides with the
  literal). Nullable + function-default (`now`/`cuid`/`uuid`/
  `autoincrement`/`dbgenerated`) drops back to `!` definite-assignment;
  the runtime value is `undefined` pre-insert, Prisma's `data:` channel
  skips the field, and the schema default fires. The `@remarks` JSDoc
  that surfaces the pre-insert-undefined contract widens to cover this
  case so IDE hovers don't lie.

  **Bug 2: `@polyprism/runtime` pure-ESM crashed under ts-jest.** The
  package shipped as `"type": "module"` with no `require` condition in
  its exports map, which made it impossible to `require()` from
  CJS-flavoured test runners (ts-jest, Mocha without a loader, etc.).
  Node's `require()` of a pure-ESM package throws `ERR_REQUIRE_ESM`; the
  consumer's `transformIgnorePatterns` skipped `node_modules` by default
  so the source wasn't transpiled. Two test suites crashed at module
  load.

  The runtime now ships dual ESM + CJS via `tsup format: ["esm", "cjs"]`.
  Package.json exports map gains a `require` condition pointing at
  `./dist/index.cjs`; types resolve to `.d.cts` under `require` and
  `.d.ts` under `import`. `main` flips to the CJS sibling for legacy
  resolvers; `module` lands on the ESM entry for bundlers that read it.
  A new `tests/cjs-load.test.ts` gates against regressions by
  `require()`-loading `dist/index.cjs` and verifying the full public API
  surface (`coerceInt`/`coerceFloat`/`coerceBigInt`/`coerceDate`/
  `normalise`/`normaliseNullable`) is exposed.

  **Build infra:** CI workflow reorders Typecheck → **Build** → Test
  (was Typecheck → Test → Build). The CJS-load test asserts `dist/
index.cjs` exists; running it before Build on a fresh CI checkout
  would hard-fail every CI run regardless of code state. Reordering
  means the artifacts are real by the time anything inspects them.

  **Renderer hygiene:** `resolvePrivateFieldInitializer` now consumes
  the already-computed `initFallback` instead of re-deriving the
  prisma-assigned classification from `field.default?.kind`. Single
  source of truth for the same logical decision; keeps the slot
  initializer in lockstep with the constructor's init-assignment logic
  against future changes.

- Updated dependencies [e802ca8]
  - @polyprism/core@0.1.6
  - @polyprism/ts-shared@0.1.6

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

- Updated dependencies [9adb1e9]
  - @polyprism/core@0.1.5
  - @polyprism/ts-shared@0.1.5

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

- Updated dependencies [8d102f1]
  - @polyprism/core@0.1.4
  - @polyprism/ts-shared@0.1.4

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

- Updated dependencies [f6554a5]
  - @polyprism/core@0.1.3
  - @polyprism/ts-shared@0.1.3

## 0.1.2

### Patch Changes

- 88ab6b9: Cross-link the existing pattern READMEs to the newly-published
  `@polyprism/ts-domain-class` and remove the now-stale "planned for v0.3 /
  on the roadmap" language. The annotation tables for `@normalise` and
  `@coerce` in `ts-interface` (and equivalents) now correctly state that
  runtime behaviour fires inside `ts-domain-class`, with `@noCoerce`
  documented alongside. Sibling-pattern lists across all four core READMEs
  gain a `ts-domain-class` entry. Scrub one consumer-specific reference
  ("Shopify API") from the `ts-domain-class` README example so the npm
  landing page reads as a generic example.

  No code changes — docs-only patch bump.

- Updated dependencies [88ab6b9]
  - @polyprism/core@0.1.2
  - @polyprism/ts-shared@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [bcaf661]
  - @polyprism/core@0.1.1
  - @polyprism/ts-shared@0.1.1
