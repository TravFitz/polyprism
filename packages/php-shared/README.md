# @polyprism/php-shared

PHP rendering primitives shared by every `php-*` pattern in [PolyPrism](https://github.com/TravFitz/polyprism) — a Prisma 6 & 7 generator that emits typed code from your `schema.prisma` in whichever shape fits the layer you're writing.

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies on any published `@polyprism/*` package.**

## You're probably looking for a pattern package

You don't install `@polyprism/php-shared` directly — each `php-*` pattern package pulls it in transitively.

| Install | What it emits |
|---|---|
| [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class) | `final class User { ... }` — PHP 8.1+, mutable, public typed properties via constructor property promotion |
| [`@polyprism/php-readonly`](https://www.npmjs.com/package/@polyprism/php-readonly) | `final readonly class User { ... }` — PHP 8.2+, immutable value objects |

## What lives here

The PHP-specific layer between [`@polyprism/core`](https://www.npmjs.com/package/@polyprism/core)'s language-agnostic IR and the per-pattern emitters:

- **`emitPhpModels(ctx, opts)`** — the top-level pipeline. Walks the IR, renders enums and models, surfaces any emit-time diagnostics, and writes everything to `<outputDir>/Enums/*.php` + `<outputDir>/Models/*.php`.
- **`renderPhpModel(opts)`** — emits one model file as a PHP class. Two declaration styles (`"class"` and `"readonly"`) share the same field-by-field rendering loop; the keyword block at the top of the class is the only differentiator.
- **`renderPhpEnum(opts)`** — emits a PHP 8.1+ backed enum (`enum Role: string { case ADMIN = 'ADMIN'; }`).
- **`mapFieldPhpType`** — IR field → PHP type expression. Handles scalars, enums, relations, nullability, and lists (with PHPDoc `@var array<int, T>` hints).
- **`UseCollector`** — deduped, sorted `use`-statement builder. Skips same-namespace references automatically.
- **`renderPhpDoc`** — PHPDoc emission for `///` docs, `@deprecated` tags, native-type metadata, and list-element hints.

## What's NOT in here (v0 scope)

- `@coerce` / `@normalise` / `@noCoerce` annotations are recognised but ignored. They're domain-class concepts that need PHP 8.4 property hooks and a Composer-published runtime helper — that'll ship as a future `@polyprism/php-domain-class`.
- `@json(...)` annotations on Json fields fall back to `mixed` with a warning. PHP doesn't have a structural-typing equivalent of TS's anonymous object types.
- Source-position line numbers on diagnostics — DMMF doesn't expose them, so issues carry `Model.field` context strings instead.

## Why this is split out from `@polyprism/core`

`@polyprism/core` is deliberately language-agnostic — IR, Prisma schema reader, annotation parser, naming resolver. `@polyprism/php-shared` is where PHP-specific concerns live. Both `php-class` and `php-readonly` share one PHP rendering layer, so they agree on type mapping, use-statement handling, and PHPDoc by construction — not by convention.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
