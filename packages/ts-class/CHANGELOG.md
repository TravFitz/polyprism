# @omniprism/ts-class

## 0.1.0

### Minor Changes

- Initial public release of OmniPrism — a multi-pattern Prisma type generator.

  ### What's in v0.1

  - **`@omniprism/core`** — language-agnostic IR, DMMF reader, annotation parser, and naming layer. Zero third-party runtime dependencies.
  - **`@omniprism/ts-shared`** — TypeScript-specific rendering primitives shared across the three pattern emitters.
  - **`@omniprism/ts-interface`** — emits `export interface User { ... }` types.
  - **`@omniprism/ts-type`** — emits `export type User = { ... };` aliases.
  - **`@omniprism/ts-class`** — emits `export class User { ... }` with public fields. A replacement for the abandoned `prisma-class-generator`.

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
  - @omniprism/core@0.1.0
  - @omniprism/ts-shared@0.1.0
