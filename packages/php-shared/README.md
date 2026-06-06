# @polyprism/php-shared

PHP rendering primitives shared by every `php-*` pattern in [PolyPrism](https://github.com/TravFitz/polyprism) — a Prisma 6 & 7 generator that emits typed code from your `schema.prisma` in whichever shape fits the layer you're writing.

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies on any published `@polyprism/*` package.**

## You're probably looking for a pattern package

You don't install `@polyprism/php-shared` directly — each `php-*` pattern package pulls it in transitively.

| Install | What it emits |
|---|---|
| [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class) | `final class User { ... }` — PHP 8.1+, mutable, public typed properties via constructor property promotion |
| [`@polyprism/php-readonly`](https://www.npmjs.com/package/@polyprism/php-readonly) | `final readonly class User { ... }` — PHP 8.2+, immutable value objects |
| [`@polyprism/php-domain-class`](https://www.npmjs.com/package/@polyprism/php-domain-class) | `final class User { public string $email { set(...) { ... } } }` — PHP 8.4+, property-hook setters that route `@coerce` / `@normalise` through the [`polyprism/runtime`](https://packagist.org/packages/polyprism/runtime) Composer package |

## What lives here

The PHP-specific layer between [`@polyprism/core`](https://www.npmjs.com/package/@polyprism/core)'s language-agnostic IR and the per-pattern emitters:

- **`emitPhpModels(ctx, opts)`** — the top-level pipeline. Walks the IR, renders enums and models, surfaces any emit-time diagnostics, and writes everything to `<outputDir>/Enums/*.php` + `<outputDir>/Models/*.php`.
- **`renderPhpModel(opts)`** — emits one model file as a PHP class. Three declaration styles (`"class"`, `"readonly"`, `"domain-class"`) share the same field-by-field type-mapping and PHPDoc emission; `"domain-class"` delegates to its own renderer (property hooks need a different shape from constructor property promotion).
- **`renderPhpDomainClass(opts)`** — emits the PHP 8.4 property-hook variant used by `@polyprism/php-domain-class`. Setter pipelines route `@coerce` / `@normalise` through `Polyprism\Runtime\Coerce` and `Polyprism\Runtime\Normalise` (from the Composer-published [`polyprism/runtime`](https://packagist.org/packages/polyprism/runtime) package).
- **`resolvePhpCoerceDecision`** — PHP-flavoured wrapper around `@polyprism/core`'s language-neutral `resolveCoerceKind`. Returns the widened PHP setter input type (`int|string`, `\DateTimeImmutable|string|int`, etc.) plus the matching runtime method.
- **`renderPhpEnum(opts)`** — emits a PHP 8.1+ backed enum (`enum Role: string { case ADMIN = 'ADMIN'; }`).
- **`mapFieldPhpType`** — IR field → PHP type expression. Handles scalars, enums, relations, nullability, lists (with PHPDoc `@var array<int, T>` hints), and resolves `@json` references to generated value classes.
- **`renderPhpJsonType`** — Parses a TS-shaped inline `@json` expression (a small supported subset) and emits a `final readonly class` for it. Nested objects collapse to PHPDoc `array{...}` shapes rather than spawning sub-classes.
- **`UseCollector`** — deduped, sorted `use`-statement builder. Skips same-namespace references automatically.
- **`renderPhpDoc`** + **`collectFieldExtraTags`** — PHPDoc emission for `///` docs, `@deprecated` tags, native-type metadata, and list-element hints.
- **`phpSingleQuote`** + **`phpNormaliseOpConstant`** + **`formatPhpDefault`** — small literal-formatting helpers shared between `render-model.ts` and `render-domain-class.ts`.

## What's NOT in here (v0 scope)

- TS unions / generics / identifier references inside an inline `@json` shape — fall back to `mixed` with a warning. Use `@type("\\App\\YourType")` to point at a hand-written PHP class for richer typing.
- Bare and with-path `@json` forms (e.g. `@json(SomeType)`, `@json(SomeType from "./path")`) — these rely on TS module imports that don't translate to PHP autoloading. Warn + fall back to `mixed`.
- Source-position line numbers on diagnostics — DMMF doesn't expose them, so issues carry `Model.field` context strings instead.
- A `php-interface` emitter for shape-contract interfaces (PHP 8.4 supports abstract property declarations on interfaces, but the idiomatic PHP DTO is a `final readonly class` — deferred until a real user asks).
- A `php-type` emitter — not possible: PHP has no type-alias syntax at the language level.

## Why this is split out from `@polyprism/core`

`@polyprism/core` is deliberately language-agnostic — IR, Prisma schema reader, annotation parser, naming resolver, the language-neutral coerce-rules decision matrix, diagnostic surface, and ident-lookup builders. `@polyprism/php-shared` is where PHP-specific concerns live. All three PHP pattern packages share one PHP rendering layer, so they agree on type mapping, use-statement handling, and PHPDoc by construction — not by convention.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
