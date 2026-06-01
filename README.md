# OmniPrism

> One Prisma schema. Many shapes. Pick your output by changing a single
> config string.

OmniPrism is a [Prisma](https://www.prisma.io) generator that emits
TypeScript types from your `schema.prisma` in **the shape you actually want**:
interface, type alias, plain class — and (post v0.1) domain class with
getters/setters, Zod, Valibot, ArkType, TypeBox, and more.

```prisma
generator omniprismCodegen {
  provider = "omniprism-ts-interface"  // or ts-type / ts-class
  output   = "../generated"
}
```

That's the whole API. Swap the provider, get a different shape.

## Why this exists

Mid-2026, the Prisma codegen ecosystem has a leadership vacuum:

- [`prisma-class-generator`](https://github.com/kimjbstar/prisma-class-generator) — abandoned since Aug 2024.
- [`zod-prisma-types`](https://github.com/chrishoermann/zod-prisma-types) (~85k DL/wk) and [`prisma-zod-generator`](https://github.com/omar-dulaimi/prisma-zod-generator) (~74k DL/wk) — both entered maintenance mode Feb–Mar 2026. ~160k weekly users with no actively-maintained Zod option.
- [`prismabox`](https://github.com/m1212e/prismabox) — on hold.
- Prisma 7 (Sep 2025) went ESM-only and broke many community generators.

Worse, **every successful generator picks one output target** (Zod, TypeBox,
classes) and nails it. Multi-target tools that exist today need a separate
generator block per output, with no shared config.

OmniPrism is what we'd want if we were starting fresh in 2026: ESM-native,
Prisma 7-native, multi-pattern from one config knob, with **zero third-party
runtime dependencies** on the published packages.

## Features (v0.1)

- **3 output patterns** today, more to come: `ts-interface`, `ts-type`, `ts-class`.
- **Always-on standalone enum files** — solves the manual-mirror trap where ESM consumers can't `Object.values(MyEnum)` against a CJS `@prisma/client` re-export.
- **7 doc-comment annotations**: `@hide`, `@deprecated`, `@json` (4 forms), `@type`, `@name`, `@normalise`, `@coerce`.
- **`prisma-json-types-generator` shorthand compatibility**: accepts `/// [TypeName]` as an alias for `@json(TypeName)`.
- **Three-axis naming config**: file, type, field — each pickable independently. Snake, kebab, Pascal, camel, preserve.
- **Per-identifier `@name(NewName)` override** — escape hatch for the global naming rule.
- **`@db.X(p, s)` precision** captured as JSDoc so the schema-level info isn't lost.
- **Optional barrel** (`emitIndex = true`) with class-mode awareness (`export { User }` vs. `export type { User }` based on the pattern).
- **Pretty-formatted inline JSON types** — multi-property objects break onto lines instead of becoming one-line monstrosities.
- **Zero third-party runtime dependencies** on any published `@omniprism/*` package.

## Quick start

```bash
pnpm add -D prisma @omniprism/ts-interface
```

```prisma
// prisma/schema.prisma
generator omniprismCodegen {
  provider = "omniprism-ts-interface"
  output   = "../app/types/generated"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  MEMBER
}

model User {
  id    String @id @default(cuid())
  email String @unique
  name  String
  role  Role   @default(MEMBER)
}
```

```bash
pnpm prisma generate
```

```ts
// app/types/generated/User.ts
import type { Role } from "./enums/Role.js";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}
```

## The three patterns, side-by-side

Same model. Swap the provider. That's it.

<table>
<tr>
<th align="left"><code>omniprism-ts-interface</code></th>
<th align="left"><code>omniprism-ts-type</code></th>
<th align="left"><code>omniprism-ts-class</code></th>
</tr>
<tr>
<td>

```ts
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}
```

</td>
<td>

```ts
export type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};
```

</td>
<td>

```ts
import { Role } from "./enums/Role.js";

export class User {
  id!: string;
  email!: string;
  name: string | null = null;
  role: Role = Role.MEMBER;
}
```

</td>
</tr>
</table>

Class mode emits real initializer expressions so you can `new User()` and
trust the defaults — Prisma-managed values (cuid/uuid/now/autoincrement) keep
the `!` definite-assignment marker because Prisma assigns them at insert time.

## Annotation reference

All annotations live in Prisma triple-slash doc comments (`///`).

| Annotation | What it does |
|---|---|
| `@hide` | Drop a field/enum-value from the generated output entirely. |
| `@deprecated("reason")` | Emit a `@deprecated` JSDoc tag on the field/model/enum. Reason is optional. |
| `@json(Type)` | Brand a `Json` field with a TypeScript type. See [4 forms](#json-annotation--four-forms) below. |
| `@type(MyType from "./path")` | Override the inferred TS type. The `from "./path"` half is optional. |
| `@name(NewIdent)` | Rename the emitted identifier for a model/enum/field (escapes global casing). |
| `@normalise(trim, lowercase, ...)` | Parsed in v0.1, used by `ts-domain-class` (v0.3). |
| `@coerce(date \| int \| ...)` | Parsed in v0.1, used by `ts-domain-class` (v0.3). |

### `@json` annotation — four forms

```prisma
// 1. Bare — user is responsible for the type being importable.
/// @json(UserMetadata)
metadata Json

// 2. With explicit import path — we emit the import for you.
/// @json(BillingAddress from "./types/billing")
address Json

// 3. Inline anonymous — auto-generates `{Model}{Field}` (e.g. UserSettings).
//    Emits to `json-types/UserSettings.ts`.
/// @json({ theme: string, locale: string, notifications: { email: boolean } })
settings Json

// 4. Inline named — explicit name for the auto-generated type.
//    Emits to `json-types/AuditPayload.ts`.
/// @json(AuditPayload = { actor: string, action: string, ts: number })
auditMeta Json

// Compatibility: prisma-json-types-generator's `/// [TypeName]` is accepted
// as an alias for Form 1.
/// [LegacyMetadata]
legacy Json
```

## Naming config

Three project-level keys on the generator block. Defaults in **bold**.

| Key | Options |
|---|---|
| `fileNaming` | **PascalCase** \| camelCase \| kebab-case \| snake_case \| preserve |
| `typeNaming` | **PascalCase** \| camelCase \| snake_case \| preserve |
| `fieldNaming` | camelCase \| snake_case \| **preserve** |

Use `@name(NewName)` on an individual model/enum/field to override the
global rule for that one identifier.

## How does this compare to ___?

| | OmniPrism | prisma-class-generator | zod-prisma-types | prismabox |
|---|---|---|---|---|
| Status | Active | Abandoned (Aug 2024) | Maintenance (Feb 2026) | On hold |
| Multi-pattern from one config | ✅ | ❌ (classes only) | ❌ (Zod only) | ❌ (TypeBox only) |
| Prisma 7 native (ESM-only) | ✅ | ❌ | ⚠️ | ⚠️ |
| Standalone enum files | ✅ (always-on) | ❌ | ✅ | ✅ |
| Zero runtime deps on published pkgs | ✅ | ❌ | ❌ | ❌ |
| Decimal as `Decimal` (not `number`) | ✅ | ❌ (emits `number`) | ✅ | ✅ |

## Examples

Three example schemas live in `examples/` — each picks a different pattern
and a different complexity tier:

- **[`examples/simple-blog/`](examples/simple-blog)** — minimal, zero
  annotations, uses `ts-type`. The "what does zero-config look like" tour.
- **[`examples/task-tracker/`](examples/task-tracker)** — mid-weight Kanban
  schema using `ts-class`. Showcases initializer expressions, mixed
  type-vs-value imports for enum defaults, and the fix to the long-standing
  prisma-class-generator integer-default-Date bug.
- **[`examples/complex-ecommerce/`](examples/complex-ecommerce)** — kitchen
  sink using `ts-interface`. Every scalar type, all 4 `@json` forms, `@hide`,
  `@deprecated`, `@name` override, self-referential relations, composite
  unique indexes, `@db.*` native types.

## Roadmap

| Version | Adds |
|---|---|
| **0.1** (now) | `ts-interface`, `ts-type`, `ts-class`, 7 annotations, three-axis naming, enum + JSON-type file emission |
| 0.2 | Polish: error messages with schema line numbers, JSDoc emission from Prisma `///` comments on models, richer README |
| 0.3 | `ts-domain-class` — private state + getters/setters + builder + `from()` + `toJSON()`. `@normalise` + `@coerce` become active here. |
| 0.4 | `ts-zod` — landing during the Zod-from-Prisma maintenance vacuum |
| 1.0 | Docs site, JSON-Schema-validated config, public stability commitment on the emitter API |
| Later | `ts-valibot`, `ts-arktype`, `ts-typebox`, `ts-effect-schema`, `ts-standard-schema`, PHP emitter family |

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
setup and workflow. By participating you agree to the project's
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Travis Fitzgerald
