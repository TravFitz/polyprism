# @polyprism/ts-class

A Prisma 6 & 7 generator that emits TypeScript **classes** with public fields from your `schema.prisma`. A modern, maintained, ESM-native replacement for the abandoned [`prisma-class-generator`](https://github.com/kimjbstar/prisma-class-generator). Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```ts
export class User {
  id!: string;
  email!: string;
  name: string | null = null;
  role: Role = Role.MEMBER;
}

const u = new User();
u.email = "x@y.z";
// id is Prisma-assigned at insert; name and role already have defaults.
```

**Pure ESM, Prisma 7-native, zero third-party runtime dependencies.** CI tests against both Prisma 6 and Prisma 7. The generated code imports nothing from PolyPrism itself — drop the generator and your output keeps compiling.

## Install

```bash
pnpm add -D prisma @polyprism/ts-class
```

## Configure

```prisma
generator polyprismCodegen {
  provider = "polyprism-ts-class"
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
// generated/Task.ts
import { Priority } from "./enums/Priority.js";
import { TaskStatus } from "./enums/TaskStatus.js";
import type { Project } from "./Project.js";

export class Task {
  id!: string;
  title!: string;
  description: string | null = null;
  status: TaskStatus = TaskStatus.TODO;
  priority: Priority = Priority.MEDIUM;
  points: number = 0;
  completed: boolean = false;
  projectId!: string;
  project!: Project;
  tags: string[] = [];
}
```

Use it the obvious way:

```ts
const t = new Task();
t.title = "Ship it";
t.priority = Priority.HIGH;
// status, completed, points, tags already have defaults from the schema
```

Every enum is **also** emitted as its own standalone ESM file at `<output>/enums/<EnumName>.ts`.

## What makes class mode distinct

- **Real initializer expressions** for fields with a TS-representable default (Int/Float literals, Boolean literals, String literals, enum values, list-as-`[]`, nullable-as-`null`). `new Task()` gives you a fully-defaulted instance — no manual `Object.assign` dance.
- **`!` definite-assignment** for fields Prisma populates at insert time (`cuid()`, `uuid()`, `now()`, `autoincrement()`, `dbgenerated()`) — so TypeScript trusts they'll be there at read time without forcing you to write a constructor.
- **Mixed type-vs-value imports**: enum imports auto-promote to runtime imports when used as a default value (e.g. `import { type X, Status }` if `Status.PENDING` appears as a default). The import collector handles this automatically.
- **Bug fix vs. `prisma-class-generator`**: an `Int @default(90)` on a `DateTime` field gets `!: Date`, not `Date.parse("90")`. Mismatched literal/scalar pairs fall through to `!` instead of producing nonsense.

## What you also get out of the box

- **Prisma 6 & 7 compatibility** — same generator binary, both Prisma majors. CI tests against both, including the Prisma 7 `prisma.config.ts` layout.
- **Pure ESM** from day one — not retrofitted from a CJS codebase. No `require()`, no `.cjs` re-export shims.
- **Zero third-party runtime dependencies.** This package depends only on `@polyprism/core` and `@polyprism/ts-shared`, neither of which has a third-party runtime dep.
- **Eight `///` annotations** — `@hide`, `@deprecated`, `@json` (four forms), `@type`, `@name`, `@normalise`, `@coerce`, `@noCoerce`. Plus `prisma-json-types-generator` shorthand compatibility (`/// [TypeName]`).
- **Three-axis naming config** — independently control file, type, and field naming.
- **`@db.X(p, s)` precision captured as JSDoc** so the schema-level info survives codegen.
- **Optional barrel** (`emitIndex = true`) with class-mode awareness (`export { User }` vs. `export type { User }`).

## Migrating from `prisma-class-generator`

1. Replace the generator block:

   ```prisma
   // before
   generator prismaClassGenerator {
     provider = "prisma-class-generator"
     output   = "../generated"
   }

   // after
   generator polyprismCodegen {
     provider = "polyprism-ts-class"
     output   = "../generated"
   }
   ```

2. Audit any `Decimal` fields. `prisma-class-generator` emitted them as `number` (silently wrong); PolyPrism emits the actual `Decimal` type from `@prisma/client/runtime/library`. Code that was treating Decimal-as-number may need `.toNumber()` or `.toString()` calls at boundaries.

3. Delete any manual enum mirror files. PolyPrism always emits standalone ESM enum files at `<output>/enums/`.

## Config options + annotations

Identical across all `ts-*` patterns — see the [root README](https://github.com/TravFitz/polyprism) for the full config reference and annotation grammar.

## When `ts-class` isn't enough

This package is the **plain-class** pattern — public fields, no behaviour, no data laundering. Use it when you want the conciseness of a class shape without ceremony, and you're happy assigning fields directly.

If you need any of:

- **Setter-driven data normalisation** (trim, lowercase, uppercase, nullEmptyToNull on assignment)
- **Setter-driven type coercion** (`"5"` → `5` on Int, `"10.99"` → `Decimal(10.99)` on Decimal, etc.)
- **Private fields with controlled accessors** instead of public-field assignment
- **Fluent builder** (`User.builder().email("...").build()`)
- **`User.from(data)` static factory** for hydrating untrusted shapes (HTTP bodies, Prisma rows)
- **`toJSON()` that handles BigInt** without throwing

...reach for [`@polyprism/ts-domain-class`](https://www.npmjs.com/package/@polyprism/ts-domain-class) instead. Same schema, same annotations — domain-class activates `@normalise` and `@coerce` semantics at runtime via emitted setters.

## Sibling patterns

Same schema, different output shape — just swap the provider:

- [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) — `export interface User { ... }`
- [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) — `export type User = { ... };`
- [`@polyprism/ts-domain-class`](https://www.npmjs.com/package/@polyprism/ts-domain-class) — opinionated domain class with getters/setters, `@normalise`/`@coerce` data laundering, `from()`, `toJSON()`, and a fluent builder

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
