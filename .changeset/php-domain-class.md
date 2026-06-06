---
"@polyprism/php-domain-class": minor
"@polyprism/php-shared": patch
"@polyprism/php-class": patch
"@polyprism/php-readonly": patch
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-type": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
---

> **Two "runtime" packages, two registries.** This release introduces a NEW Composer package, `polyprism/runtime` (on Packagist), which is a separate codebase from the npm `@polyprism/runtime` listed in the version-bump table above. The npm runtime patch-bumps with the rest of the fixed-version group (no functional changes); the Composer runtime ships as v0.2.x on Packagist independently. Nothing about `@polyprism/runtime` on npm changes in this release.

Add **`@polyprism/php-domain-class`** — the PHP equivalent of `@polyprism/ts-domain-class`. Completes the deferred half of the PHP emitter family.

**What's new:**

- New pattern package `@polyprism/php-domain-class` emits PHP 8.4 domain classes with **property hooks**. Setter-driven `@coerce` / `@normalise` / `@noCoerce` finally fire on the PHP side, identical to how `ts-domain-class` does it in TypeScript.
- New Composer-published runtime package [`polyprism/runtime`](https://github.com/TravFitz/polyprism/tree/main/packages/runtime-php) (on Packagist) provides the `Polyprism\Runtime\Coerce` and `Polyprism\Runtime\Normalise` helpers the generated setters call into. Zero third-party deps. Same five default-coerce targets as the npm runtime: `Int`, `Float`, `BigInt`, `Decimal`, `DateTime`.
- Cross-type `@coerce(target)` types the storage slot to the coerce target's canonical PHP type — `String @coerce(int)` now correctly stores `int`, not `string`. (The PHP property-hook contract surfaces this at runtime where TS would only catch it at typecheck time. The TS implementation has the same latent shape and may get a follow-up adjustment, but the immediate fix is in `php-shared`'s new `render-domain-class.ts`.)
- Every generated class gets a static `from(array $data): self` factory that hydrates a Record-like array through the constructor — `@coerce` and `@normalise` fire on every field. Missing required fields throw `\TypeError` with the field name; optional/defaulted fields fall through to their constructor default; unknown keys are silently dropped. Matches the ergonomic shape of `@polyprism/ts-domain-class`'s `static from(data: Record<string, unknown>): User` so the PHP-side hydration story is parity-complete with the TS side.

**Prisma-managed fields and `@hide`.** Unlike `ts-domain-class`, the PHP renderer doesn't auto-exclude fields with function defaults like `@id @default(autoincrement())` or `@updatedAt` from the `from()` shape — these stay as required fields by default. If you're building a DTO for *creating* new records (POST handlers, queue producers), annotate Prisma-managed fields with `@hide` to drop them from the class. For *reading* fetched rows, keep them on the class and pass them through. This is the deliberate v0 trade: explicit-via-annotation rather than implicit-via-introspection, matching PHP's "explicit > magic" idiom. See the [`@polyprism/php-domain-class` README](https://github.com/TravFitz/polyprism/tree/main/packages/php-domain-class#excluding-prisma-managed-fields-with-hide) for the full pattern.

**Consumer install:**

```bash
npm i -D @polyprism/php-domain-class    # the generator
composer require polyprism/runtime      # the runtime that generated code calls into
```

```prisma
generator polyprismCodegen {
  provider = "polyprism-php-domain-class"
  output   = "../generated"
}
```

**Shape of the emitted output** (compared to `php-class` / `php-readonly`):

- Properties live OUTSIDE the constructor (no constructor property promotion). PHP 8.4 promoted-property hooks do NOT widen the constructor param type; promoted-property assignment bypasses the set hook. Non-promoted properties + an explicit constructor body that assigns through `$this->prop = $arg;` route every initial value through the hook — the load-bearing contract for `@coerce` / `@normalise` to fire on construction.
- Strict fields with no `@normalise` emit as plain typed properties (no hook block, no dispatch overhead).
- Constructor params widen to the **setter input type** (e.g. `int|string` for `Int`, `\DateTimeImmutable|string|int` for `DateTime`).

**Compatibility for the other PHP packages:** `php-class` and `php-readonly` still recognise `@coerce` / `@normalise` / `@noCoerce` but ignore them — nothing about their emit shape changes in this release. The `php-shared` patch bump reflects the new `render-domain-class.ts` + `coerce-rules.ts` modules plus a small dispatch tweak in `emit-models.ts` for the third declarationStyle.

**Non-PHP packages** in the @polyprism/* fixed-version group ship a patch with no functional changes — the fixed-version group requires them to move together.

**Packagist registration**: `polyprism/runtime` is a new Composer package. On first release the user needs to register the package at packagist.org pointing at the GitHub repo with subdirectory `packages/runtime-php/`. Subsequent versions auto-publish on git tag.
