---
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Two consumer-reported bugs from the shopify-duty-tax dogfood of
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
