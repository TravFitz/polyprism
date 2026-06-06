# @polyprism/php-shared

## 0.3.0

### Patch Changes

- 934048c: > **Two "runtime" packages, two registries.** This release introduces a NEW Composer package, `polyprism/runtime` (on Packagist), which is a separate codebase from the npm `@polyprism/runtime` listed in the version-bump table above. The npm runtime patch-bumps with the rest of the fixed-version group (no functional changes); the Composer runtime ships as v0.2.x on Packagist independently. Nothing about `@polyprism/runtime` on npm changes in this release.

  Add **`@polyprism/php-domain-class`** — the PHP equivalent of `@polyprism/ts-domain-class`. Completes the deferred half of the PHP emitter family.

  **What's new:**

  - New pattern package `@polyprism/php-domain-class` emits PHP 8.4 domain classes with **property hooks**. Setter-driven `@coerce` / `@normalise` / `@noCoerce` finally fire on the PHP side, identical to how `ts-domain-class` does it in TypeScript.
  - New Composer-published runtime package [`polyprism/runtime`](https://github.com/TravFitz/polyprism/tree/main/packages/runtime-php) (on Packagist) provides the `Polyprism\Runtime\Coerce` and `Polyprism\Runtime\Normalise` helpers the generated setters call into. Zero third-party deps. Same five default-coerce targets as the npm runtime: `Int`, `Float`, `BigInt`, `Decimal`, `DateTime`.
  - Cross-type `@coerce(target)` types the storage slot to the coerce target's canonical PHP type — `String @coerce(int)` now correctly stores `int`, not `string`. (The PHP property-hook contract surfaces this at runtime where TS would only catch it at typecheck time. The TS implementation has the same latent shape and may get a follow-up adjustment, but the immediate fix is in `php-shared`'s new `render-domain-class.ts`.)
  - Every generated class gets a static `from(array $data): self` factory that hydrates a Record-like array through the constructor — `@coerce` and `@normalise` fire on every field. Missing required fields throw `\TypeError` with the field name; optional/defaulted fields fall through to their constructor default; unknown keys are silently dropped. Matches the ergonomic shape of `@polyprism/ts-domain-class`'s `static from(data: Record<string, unknown>): User` so the PHP-side hydration story is parity-complete with the TS side.

  **Prisma-managed fields and `@hide`.** Unlike `ts-domain-class`, the PHP renderer doesn't auto-exclude fields with function defaults like `@id @default(autoincrement())` or `@updatedAt` from the `from()` shape — these stay as required fields by default. If you're building a DTO for _creating_ new records (POST handlers, queue producers), annotate Prisma-managed fields with `@hide` to drop them from the class. For _reading_ fetched rows, keep them on the class and pass them through. This is the deliberate v0 trade: explicit-via-annotation rather than implicit-via-introspection, matching PHP's "explicit > magic" idiom. See the [`@polyprism/php-domain-class` README](https://github.com/TravFitz/polyprism/tree/main/packages/php-domain-class#excluding-prisma-managed-fields-with-hide) for the full pattern.

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

  **Non-PHP packages** in the @polyprism/\* fixed-version group ship a patch with no functional changes — the fixed-version group requires them to move together.

  **Packagist registration**: `polyprism/runtime` is a new Composer package. On first release the user needs to register the package at packagist.org pointing at the GitHub repo with subdirectory `packages/runtime-php/`. Subsequent versions auto-publish on git tag.

- Updated dependencies [934048c]
  - @polyprism/core@0.3.0

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
  - @polyprism/core@0.2.0
