# @polyprism/ts-type

TypeScript **type alias** emitter for [PolyPrism](https://github.com/TravFitz/polyprism).
Emits `export type User = { ... };` types from your Prisma schema.

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

## When to pick this over `ts-interface`

`type` and `interface` are nearly identical in TypeScript, but they diverge
in a few edge cases:

- `type` aliases can union with other types directly (`type T = User | Admin`).
- `interface` is open to declaration merging; `type` is closed.
- Some teams prefer one for stylistic consistency.

If you don't have a strong preference, [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface)
is the more conventional choice.

## Config options + annotations

See the [root README](https://github.com/TravFitz/polyprism) for the full
config reference and annotation grammar — they're identical across all
`ts-*` patterns.

## License

[MIT](../../LICENSE) © Travis Fitzgerald
