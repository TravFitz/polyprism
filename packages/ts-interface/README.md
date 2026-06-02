# @polyprism/ts-interface

A Prisma 6 & 7 generator that emits TypeScript **interfaces** from your `schema.prisma`. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```ts
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}
```

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies.** CI tests against both Prisma 6 and Prisma 7. The generated code imports nothing from PolyPrism itself — drop the generator and your output keeps compiling.

## Install

```bash
pnpm add -D prisma @polyprism/ts-interface
```

## Configure

```prisma
generator polyprismCodegen {
  provider = "polyprism-ts-interface"
  output   = "../generated"
}
```

> ⚠️ The provider string is the **bin name** (no `@scope/` prefix). Bin names can't contain `/`, so you write `polyprism-ts-interface`, not `@polyprism/ts-interface`.

## Run

```bash
pnpm prisma generate
```

## Output

```ts
// generated/User.ts
import type { Role } from "./enums/Role.js";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}
```

Every enum is **also** emitted as its own standalone ESM file at `<output>/enums/<EnumName>.ts`, so you can `Object.values(MyEnum)` directly without re-exporting through `@prisma/client` (whose CJS shape doesn't always play nicely with ESM consumers).

## What you get out of the box

- **Prisma 6 & 7 compatibility** — same generator binary, both Prisma majors. CI tests against both, including the Prisma 7 `prisma.config.ts` layout.
- **Pure ESM** from day one — not retrofitted from a CJS codebase. No `require()`, no `.cjs` re-export shims, no surprise.
- **Zero third-party runtime dependencies.** This package depends only on `@polyprism/core` and `@polyprism/ts-shared`, neither of which has a third-party runtime dep.
- **Seven `///` annotations** — see [Annotations](#annotations) below.
- **Three-axis naming config** — independently control file, type, and field naming (`snake_case`, `kebab-case`, `PascalCase`, `camelCase`, or `preserve`).
- **Per-identifier `@name(NewName)` override** — escape hatch for the global naming rule.
- **`@db.X(p, s)` precision captured as JSDoc** so the schema-level info survives codegen.
- **Optional barrel** (`emitIndex = true`).
- **Pretty-formatted inline JSON types** — multi-property objects from `@json({ ... })` get broken onto multiple lines instead of collapsed onto one.
- **`prisma-json-types-generator` shorthand compatibility** — `/// [TypeName]` accepted as an alias for `@json(TypeName)`, so existing schemas migrate cleanly.

## Config options

All keys go on the `generator polyprismCodegen { ... }` block:

| Key | Default | Options |
|---|---|---|
| `output` | — | Path to the output directory (relative to the schema). |
| `fileNaming` | `PascalCase` | `PascalCase` \| `camelCase` \| `kebab-case` \| `snake_case` \| `preserve` |
| `typeNaming` | `PascalCase` | `PascalCase` \| `camelCase` \| `snake_case` \| `preserve` |
| `fieldNaming` | `preserve` | `camelCase` \| `snake_case` \| `preserve` |
| `emitIndex` | `false` | `"true"` to emit a barrel `index.ts`. |

## Annotations

All annotations live in Prisma triple-slash doc comments (`///`):

| Annotation | What it does |
|---|---|
| `@hide` | Drop a field/enum-value from the generated output entirely. |
| `@deprecated("reason")` | Emit a `@deprecated` JSDoc tag. Reason optional. |
| `@json(Type)` | Brand a `Json` field with a TypeScript type. Four forms: bare, with-import, inline-anonymous, inline-named. |
| `@type(MyType from "./path")` | Override the inferred TS type entirely. |
| `@name(NewIdent)` | Rename the emitted identifier (escapes global casing). |
| `@normalise(...)` | Parsed today; activates with `ts-domain-class` (v0.3 roadmap). |
| `@coerce(...)` | Parsed today; activates with `ts-domain-class` (v0.3 roadmap). |

Full grammar in the [root README](https://github.com/TravFitz/polyprism#annotation-reference).

## Sibling patterns

Same schema, different output shape — just swap the provider:

- [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) — `export type User = { ... };`
- [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) — `export class User { ... }` with real initializer expressions

More patterns on the roadmap: domain class with getters/setters, Zod, Valibot, ArkType, TypeBox.

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
