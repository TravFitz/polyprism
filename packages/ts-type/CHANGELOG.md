# @polyprism/ts-type

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

- bcaf661: Rewrite the public READMEs across all packages so the npm landing pages
  lead with capability — Prisma 6 & 7 support, pure ESM, zero runtime
  dependencies, and the multi-pattern emit story. The previous READMEs
  were timid and didn't surface enough signal for someone searching npm
  for "prisma generator" to land on the right page.

  No code changes — docs-only patch bump.

- Updated dependencies [bcaf661]
  - @polyprism/core@0.1.1
  - @polyprism/ts-shared@0.1.1

## 0.1.0

### Minor Changes

- Initial public release of PolyPrism — a multi-pattern Prisma type generator.

  ### What's in v0.1

  - **`@polyprism/core`** — language-agnostic IR, DMMF reader, annotation parser, and naming layer. Zero third-party runtime dependencies.
  - **`@polyprism/ts-shared`** — TypeScript-specific rendering primitives shared across the three pattern emitters.
  - **`@polyprism/ts-interface`** — emits `export interface User { ... }` types.
  - **`@polyprism/ts-type`** — emits `export type User = { ... };` aliases.
  - **`@polyprism/ts-class`** — emits `export class User { ... }` with public fields. A replacement for the abandoned `prisma-class-generator`.

  ### Features

  - **Always-on per-enum file emission** — every enum gets its own ESM `.ts` file, eliminating the manual-mirror trap when consumers use Vite SSR or other tools that can't extract named exports from `@prisma/client`.
  - **Seven doc-comment annotations**: `@hide`, `@deprecated`, `@json` (four forms), `@type`, `@name`, `@normalise`, `@coerce`. `@normalise` and `@coerce` are parsed in v0.1 but no-op outside the future `domain-class` pattern.
  - **`prisma-json-types-generator` compatibility** — accept `/// [TypeName]` as an alias for `/// @json(TypeName)`.
  - **Three-axis naming config** — independent control over file casing, type casing, and field casing on the generator block.
  - **Optional `index.ts` barrel** — opt in via `emitIndex = true`.
  - **Decimal correctness** — Decimal fields are typed as `Decimal` (from `@prisma/client/runtime/library`), not `number`. Fixes a silent precision bug in `prisma-class-generator`.

  ### Compatibility

  - **Prisma 6 and 7** supported. CI matrix exercises both majors.
  - **ESM-only.** Node 22+.
  - **Zero third-party runtime dependencies** for every published package.

### Patch Changes

- Updated dependencies
  - @polyprism/core@0.1.0
  - @polyprism/ts-shared@0.1.0
