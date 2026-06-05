---
"@polyprism/php-shared": minor
"@polyprism/php-class": minor
"@polyprism/php-readonly": minor
"@polyprism/core": minor
"@polyprism/runtime": minor
"@polyprism/ts-shared": minor
"@polyprism/ts-interface": minor
"@polyprism/ts-type": minor
"@polyprism/ts-class": minor
"@polyprism/ts-domain-class": minor
---

Add the PHP emitter family — first non-TypeScript target.

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
- Annotation support: `@hide`, `@deprecated`, `@name`, `@type`. `@coerce`/`@normalise`/`@noCoerce` are recognised but ignored in v0 (deferred to a future `@polyprism/php-domain-class` with PHP 8.4 property hooks).

**Typed JSON columns** via `@json(...)`:

- Inline-named (`/// @json(BillingAddress = { street: string, city: string })`) and inline-anonymous (`/// @json({ ... })`) forms emit a `final readonly class` under `<outputDir>/JsonTypes/<Name>.php`. The Json field on the parent model is typed as that class (with a `use` statement registered cross-namespace).
- Supported v0 TS subset inside `@json` shapes: primitives (`string`, `number → float`, `boolean`, `unknown`/`any → mixed`), optional fields (`name?: type`), arrays of primitives (`tags: string[]` → PHP `array` + PHPDoc `array<int, T>`), and nested objects (PHPDoc `array{...}` shape on a plain `array` property — no sub-class spawning).
- Unsupported shapes (unions, generics, identifier references inside an inline shape) warn + fall back to `mixed`. Use `@type("\\App\\YourType")` to point at a hand-written PHP class for richer typing.
- Bare (`@json(SomeType)`) and with-path (`@json(SomeType from "./path")`) forms warn + fall back to `mixed` — these rely on TS module imports with no PHP autoloading equivalent.
- Auto-naming collisions (two different shapes resolving to the same class name) emit a warning identifying both source fields.

**Verified Composer-compliant.** The committed showcase output passes `composer dump-autoload --strict-psr` with zero warnings, parses cleanly under `php -l` 8.2, and is exercised end-to-end via Composer's PSR-4 autoloader (instantiating every generated class, including `final readonly` enforcement, `@hide` field omission, and `json_encode` round-trip). The same `php -l` + `--strict-psr` checks run in CI on every push.

The packages emit under `<outputDir>/Models/<ClassName>.php`, `<outputDir>/Enums/<EnumName>.php`, and `<outputDir>/JsonTypes/<Name>.php`. Consumers wire the generated dir into `composer.json` autoload with a single psr-4 entry (default root namespace: `Generated\\`).

This release is a coordinated minor across the @polyprism/* fixed-version group; non-PHP packages contain no functional changes.
