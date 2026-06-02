# @polyprism/ts-shared

TypeScript rendering primitives shared by every `ts-*` pattern in [PolyPrism](https://github.com/TravFitz/polyprism) — a Prisma 6 & 7 generator that emits TypeScript types from your `schema.prisma` in whichever shape fits the layer you're writing: `interface`, `type`, plain `class`, or an opinionated `domain class` with setter-driven `@normalise`/`@coerce` data laundering.

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies on any published `@polyprism/*` package.**

## You're probably looking for a pattern package

You don't install `@polyprism/ts-shared` directly — each `ts-*` pattern package pulls it in transitively.

| Install | What it emits |
|---|---|
| [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) | `export interface User { ... }` |
| [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) | `export type User = { ... };` |
| [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) | `export class User { ... }` — plain class, public fields |
| [`@polyprism/ts-domain-class`](https://www.npmjs.com/package/@polyprism/ts-domain-class) | Opinionated domain class — private fields, getters/setters with `@normalise`/`@coerce` data laundering, `from()`, `toJSON()`, builder |

## What lives here

The TypeScript-specific layer between [`@polyprism/core`](https://www.npmjs.com/package/@polyprism/core)'s language-agnostic IR and the per-pattern emitters:

- **`renderModel({ declarationStyle })`** — emits one model file, parameterised by `"interface" | "type" | "class"`. The same code path produces all three pattern outputs; only the declaration keyword and default-value handling differ. That's how the interface, type, and class versions of your schema stay agreeing on field names, import paths, and JSON-type handling by construction.
- **`renderIndex({ declarationStyle })`** — emits the optional barrel (`index.ts`) with class-mode awareness, so it uses `export { User }` for class output and `export type { User }` for interface/type output.
- **`mapFieldTsType`** — IR field → TypeScript type expression. Handles enums, `Json`-typed fields (with the four `@json(...)` annotation forms), `Decimal`, `BigInt`, `Bytes`, arrays, and nullability.
- **`ImportCollector`** — deduped, sorted, type-vs-value-aware import block builder. Auto-promotes a `type` import to a value import when the same symbol appears as a runtime default in class mode.
- **`renderJsDoc`** — JSDoc emission for `///` docs, `@deprecated` tags, and `@db.X(p, s)` precision metadata so the schema-level info survives codegen.

## Why this is split out from `@polyprism/core`

`@polyprism/core` is deliberately language-agnostic — IR, Prisma schema reader, annotation parser, naming resolver. `@polyprism/ts-shared` is where TypeScript-specific concerns live. Every `ts-*` pattern in PolyPrism shares one TypeScript rendering layer, so they agree on import handling, naming, and JSDoc emission by construction — not by convention.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
