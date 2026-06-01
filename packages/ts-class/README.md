# @omniprism/ts-class

TypeScript **class** emitter for [OmniPrism](https://github.com/TravFitz/omniprism).
Emits plain classes with public fields from your Prisma schema. A modern,
maintained, ESM-native replacement for the abandoned
[`prisma-class-generator`](https://github.com/kimjbstar/prisma-class-generator).

## Install

```bash
pnpm add -D prisma @omniprism/ts-class
```

## Configure

```prisma
generator omniprismCodegen {
  provider = "omniprism-ts-class"
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

## What makes class mode distinct

- **Real initializer expressions** for fields with a TS-representable default
  (Int/Float literals, Boolean literals, String literals, enum values,
  list-as-`[]`, nullable-as-`null`).
- **`!` definite-assignment** for fields Prisma populates at insert time
  (`cuid()`, `uuid()`, `now()`, `autoincrement()`, `dbgenerated()`).
- **Mixed type-vs-value imports**: enum imports auto-promote to runtime
  imports when used as a default value (e.g. `import { type X, Status }` if
  `Status.PENDING` appears as a default).
- **Bug fix vs. `prisma-class-generator`**: an `Int @default(90)` on a
  DateTime field gets `!: Date`, not `Date.parse("90")`. Mismatched
  literal/scalar pairs fall through to `!` instead of producing nonsense.

## Migrating from `prisma-class-generator`

1. Replace the generator block:

   ```prisma
   // before
   generator prismaClassGenerator {
     provider = "prisma-class-generator"
     output   = "../generated"
   }

   // after
   generator omniprismCodegen {
     provider = "omniprism-ts-class"
     output   = "../generated"
   }
   ```

2. Audit any `Decimal` fields. `prisma-class-generator` emitted them as
   `number` (silently wrong); OmniPrism emits the actual `Decimal` type from
   `@prisma/client/runtime/library`. Code that was treating Decimal-as-number
   may need `.toNumber()` or `.toString()` calls at boundaries.

3. Delete any manual enum mirror files. OmniPrism always emits standalone
   ESM enum files at `<output>/enums/`.

## Config options + annotations

See the [root README](https://github.com/TravFitz/omniprism) for the full
config reference and annotation grammar.

## License

[MIT](../../LICENSE) © Travis Fitzgerald
