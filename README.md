# OmniPrism

> One Prisma schema. Many shapes. Pick your output by changing a single
> config string.

OmniPrism is a [Prisma](https://www.prisma.io) generator that emits
TypeScript types from your `schema.prisma` in whichever shape fits the layer
you're writing: interface, type alias, or plain class today — domain class
with getters/setters, Zod, Valibot, ArkType, and TypeBox on the roadmap.

```prisma
generator omniprismCodegen {
  provider = "omniprism-ts-interface"  // or ts-type / ts-class
  output   = "../generated"
}
```

That's the whole API. Swap the provider, get a different shape.

## Why this exists

Most existing Prisma codegen tools are single-target by design: one generator
emits Zod, another emits classes, another emits TypeBox. If your project
needs more than one shape of the same schema (say, interfaces for your API
layer and classes for your domain layer), you end up with multiple generator
blocks, duplicated config, and naming conventions that have to be kept in
sync by hand.

OmniPrism takes a different shape:

- **One generator, many outputs.** Pick the pattern with a single `provider`
  string. Naming, JSON-type handling, enum emission, and annotation behaviour
  are shared across every pattern — so the interface version and the class
  version of your schema agree on field names, file layout, and types.
- **ESM-native, Prisma 7-native.** Pure ESM from day one — not retrofitted
  from a CJS codebase. Works with both Prisma 6 and Prisma 7; CI tests
  both. Example fixtures use the modern Prisma 7 schema layout (`url` in
  `prisma.config.ts`).
- **Zero third-party runtime dependencies on published packages.** Each
  `@omniprism/*` pattern package depends only on `@omniprism/core`, which in
  turn has no third-party runtime deps. The generated code imports nothing
  from OmniPrism. Drop the generator and your output keeps compiling.

It's a generator I wanted for my own work and couldn't find off the shelf —
if any of the above lines up with what you're after, give it a spin.

## Features (v0.1)

- **3 output patterns** today, more to come: `ts-interface`, `ts-type`, `ts-class`.
- **Always-on standalone enum files** — every Prisma enum is also written to its own importable file, so you can `Object.values(MyEnum)` directly without re-exporting from `@prisma/client` (whose CJS shape doesn't always play nicely with ESM consumers).
- **7 doc-comment annotations**: `@hide`, `@deprecated`, `@json` (4 forms), `@type`, `@name`, `@normalise`, `@coerce`.
- **`prisma-json-types-generator` shorthand compatibility**: accepts `/// [TypeName]` as an alias for `@json(TypeName)`.
- **Three-axis naming config**: file, type, field — each pickable independently. Snake, kebab, Pascal, camel, preserve.
- **Per-identifier `@name(NewName)` override** — escape hatch for the global naming rule.
- **`@db.X(p, s)` precision** captured as JSDoc so the schema-level info isn't lost.
- **Optional barrel** (`emitIndex = true`) with class-mode awareness (`export { User }` vs. `export type { User }` based on the pattern).
- **Pretty-formatted inline JSON types** — multi-property objects emitted from `@json({ ... })` are broken onto multiple lines for readability instead of collapsed onto one.
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
  // Prisma 6 also needs `url = env("DATABASE_URL")` here.
  // Prisma 7 wants the URL in a separate `prisma.config.ts` (below).
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

```ts
// prisma.config.ts (Prisma 7 — optional on Prisma 6)
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
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
  schema using `ts-class`. Showcases initializer expressions and the mixed
  type-vs-value imports needed when enum values appear as defaults. (The
  class emitter is also scalar-kind-aware about literal defaults — see
  `formatLiteralDefault` in `packages/ts-shared/src/render-model.ts` — so
  mismatched literals like an `Int` default on a `DateTime` field fall
  through to `!` rather than producing an `Invalid Date`.)
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
| 0.4 | `ts-zod` — Zod schema emission, sharing the same naming and annotation pipeline as the type-shape patterns |
| 1.0 | Docs site, JSON-Schema-validated config, public stability commitment on the emitter API |
| Later | `ts-valibot`, `ts-arktype`, `ts-typebox`, `ts-effect-schema`, `ts-standard-schema`, PHP emitter family |

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
setup and workflow. By participating you agree to the project's
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Travis Fitzgerald
