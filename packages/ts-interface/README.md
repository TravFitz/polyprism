# @polyprism/ts-interface

TypeScript **interface** emitter for [PolyPrism](https://github.com/TravFitz/polyprism).
Emits `export interface User { ... }` types from your Prisma schema.

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

> ⚠️ The provider string is the **bin name** (no `@scope/` prefix). Bin
> names can't contain `/`, so you write `polyprism-ts-interface`, not
> `@polyprism/ts-interface`.

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

See the [root README](https://github.com/TravFitz/polyprism#annotation-reference)
for the seven supported `///` annotations: `@hide`, `@deprecated`, `@json`
(four forms), `@type`, `@name`, `@normalise`, `@coerce`.

## Sibling patterns

Same schema, different output shape — just swap the provider:

- [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) — `export type User = { ... };`
- [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) — `export class User { ... }` with real initializer expressions

## License

[MIT](../../LICENSE) © Travis Fitzgerald
