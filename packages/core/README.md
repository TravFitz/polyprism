# @polyprism/core

Internal runtime + IR layer behind [PolyPrism](https://github.com/TravFitz/polyprism) — a Prisma 6 & 7 generator that emits TypeScript types from your `schema.prisma` in whichever shape fits the layer you're writing: `interface`, `type`, or `class` today, with Zod / Valibot / ArkType / TypeBox on the roadmap.

> One Prisma schema. Many shapes. Pick your output by changing a single config string.

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies on any published `@polyprism/*` package.** CI tests against both Prisma 6 and Prisma 7.

## You're probably looking for a pattern package

You don't install `@polyprism/core` directly — each pattern package pulls it in transitively.

| Install | What it emits |
|---|---|
| [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) | `export interface User { ... }` |
| [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) | `export type User = { ... };` |
| [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) | `export class User { ... }` |

## What `@polyprism/core` actually does

It's the brain every pattern package shares:

- **IR** — `ModelDef`, `FieldDef`, `EnumDef`, `AnnotationSet`. A language-agnostic intermediate representation of your Prisma schema that every emitter reads from.
- **Schema reader** — DMMF → IR translation. **Internal; never exported.** This firewall is what lets pattern packages stay third-party-runtime-dep-free, and keeps Prisma's officially-unstable DMMF surface from leaking into user code.
- **Annotation parser** — `parseAnnotations` understands seven triple-slash annotations: `@hide`, `@deprecated`, `@json` (four forms), `@type`, `@name`, `@normalise`, `@coerce`. Plus [`prisma-json-types-generator`](https://github.com/arthurfiorette/prisma-json-types-generator) shorthand compatibility (`/// [TypeName]`).
- **Naming resolver** — `resolveTypeIdent`, `resolveFieldIdent`, `resolveTypeFilename`. Three-axis (file / type / field) casing config: snake, kebab, Pascal, camel, preserve. With per-identifier `@name(NewName)` overrides.
- **Generator runtime** — `defineGenerator`, `GeneratorContext`, virtual filesystem for testability.
- **Shared emitter helpers** — `emitEnums`, `emitJsonTypes`, `prettyFormatType`, `createInMemoryFileWriter`.

## Why this is a separate package

Two reasons:

1. **Pattern packages stay tiny.** Each `@polyprism/ts-*` package ships only its emitter and depends on `@polyprism/core` — nothing else. The *generated* code imports nothing from PolyPrism either, so you can drop the generator entirely and your output keeps compiling.
2. **One brain, many emitters.** Every pattern reads the same IR, so the `interface` version and the `class` version of your schema agree on field names, file layout, JSON-type handling, and annotation behaviour — by construction, not by convention.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
