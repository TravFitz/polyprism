# @polyprism/ts-type

A Prisma 6 & 7 generator that emits TypeScript **type aliases** from your `schema.prisma`. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```ts
export type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};
```

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies.** CI tests against both Prisma 6 and Prisma 7. The generated code imports nothing from PolyPrism itself — drop the generator and your output keeps compiling.

## Install

```bash
pnpm add -D prisma @polyprism/ts-type
```

## Configure

```prisma
generator polyprismCodegen {
  provider = "polyprism-ts-type"
  output   = "../generated"
}
```

> ⚠️ The provider string is the **bin name** (no `@scope/` prefix).

## Run

```bash
pnpm prisma generate
```

## Output

```ts
// generated/User.ts
import type { Role } from "./enums/Role.js";

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};
```

Every enum is **also** emitted as its own standalone ESM file at `<output>/enums/<EnumName>.ts`, so you can `Object.values(MyEnum)` directly without re-exporting through `@prisma/client` (whose CJS shape doesn't always play nicely with ESM consumers).

## When to pick this over `ts-interface`

`type` and `interface` are nearly identical in TypeScript, but they diverge in a few places:

- `type` aliases can union with other types directly (`type T = User | Admin`).
- `type` aliases compose into intersection (`type T = A & B`) and conditional types more ergonomically.
- `interface` is open to declaration merging; `type` is closed — which some teams prefer as a "no surprises" property.
- Some teams just prefer one for stylistic consistency.

If you don't have a strong preference, [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) is the more conventional pick.

## What you get out of the box

- **Prisma 6 & 7 compatibility** — same generator binary, both Prisma majors. CI tests against both, including the Prisma 7 `prisma.config.ts` layout.
- **Pure ESM** from day one — not retrofitted from a CJS codebase. No `require()`, no `.cjs` re-export shims, no surprise.
- **Zero third-party runtime dependencies.** This package depends only on `@polyprism/core` and `@polyprism/ts-shared`, neither of which has a third-party runtime dep.
- **Seven `///` annotations** — `@hide`, `@deprecated`, `@json` (four forms), `@type`, `@name`, `@normalise`, `@coerce`. Plus `prisma-json-types-generator` shorthand compatibility (`/// [TypeName]`).
- **Three-axis naming config** — independently control file, type, and field naming (`snake_case`, `kebab-case`, `PascalCase`, `camelCase`, or `preserve`).
- **Per-identifier `@name(NewName)` override** — escape hatch for the global naming rule.
- **`@db.X(p, s)` precision captured as JSDoc** so the schema-level info survives codegen.
- **Optional barrel** (`emitIndex = true`).
- **Pretty-formatted inline JSON types** — multi-property objects from `@json({ ... })` get broken onto multiple lines instead of collapsed onto one.

## Config options + annotations

Identical across all `ts-*` patterns — see the [root README](https://github.com/TravFitz/polyprism) for the full config reference and annotation grammar.

## Sibling patterns

Same schema, different output shape — just swap the provider:

- [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) — `export interface User { ... }`
- [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) — `export class User { ... }` with real initializer expressions

More patterns on the roadmap: domain class with getters/setters, Zod, Valibot, ArkType, TypeBox.

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
