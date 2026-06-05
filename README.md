# PolyPrism

> One Prisma schema. Many shapes. Pick your output by changing a single
> config string.

PolyPrism is a [Prisma](https://www.prisma.io) generator that emits typed
code from your `schema.prisma` in whichever shape fits the layer you're
writing: TypeScript interface, type alias, plain class, or domain class
with getters/setters — and now PHP 8.1+ classes (mutable) or PHP 8.2+
readonly value objects. Zod, Valibot, ArkType, and TypeBox on the roadmap.

```prisma
generator polyprismCodegen {
  // TypeScript family:
  provider = "polyprism-ts-interface"  // or ts-type / ts-class / ts-domain-class
  // PHP family:
  // provider = "polyprism-php-class"  // or php-readonly
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

PolyPrism takes a different shape:

- **One generator, many outputs.** Pick the pattern with a single `provider`
  string. Naming, JSON-type handling, enum emission, and annotation behaviour
  are shared across every pattern — so the interface version and the class
  version of your schema agree on field names, file layout, and types.
- **ESM-native, Prisma 7-native.** Pure ESM from day one — not retrofitted
  from a CJS codebase. Works with both Prisma 6 and Prisma 7; CI tests
  both. Example fixtures use the modern Prisma 7 schema layout (`url` in
  `prisma.config.ts`).
- **Zero third-party runtime dependencies across the whole `@polyprism/*`
  family.** No lodash, no shipped Prisma helpers, no surprise transitive
  bloat. Three of the four pattern packages (`ts-interface`, `ts-type`,
  `ts-class`) emit code that imports nothing from PolyPrism at all — drop
  the generator and the output keeps compiling. The fourth,
  `ts-domain-class`, opts you into one PolyPrism-internal runtime dep
  (`@polyprism/runtime`, ~70 LOC, zero third-party deps) in exchange for
  setter-driven `@normalise` / `@coerce` data laundering, `from()`,
  `toJSON()`, and a fluent builder. The trade is per-pattern and per-user.

It's a generator I wanted for my own work and couldn't find off the shelf —
if any of the above lines up with what you're after, give it a spin.

## Features

- **6 output patterns** today, more to come:
  - TypeScript: `ts-interface`, `ts-type`, `ts-class`, `ts-domain-class` (opinionated class with setter-driven `@normalise` + `@coerce` data laundering, `from()`, `toJSON()`, and a fluent builder).
  - PHP: `php-class` (PHP 8.1+ `final class` with constructor property promotion), `php-readonly` (PHP 8.2+ `final readonly class` value objects).
- **Always-on standalone enum files** — every Prisma enum is also written to its own importable file, so you can `Object.values(MyEnum)` directly without re-exporting from `@prisma/client` (whose CJS shape doesn't always play nicely with ESM consumers).
- **8 doc-comment annotations**: `@hide`, `@deprecated`, `@json` (4 forms), `@type`, `@name`, `@normalise`, `@coerce`, `@noCoerce`.
- **`prisma-json-types-generator` shorthand compatibility**: accepts `/// [TypeName]` as an alias for `@json(TypeName)`.
- **Three-axis naming config**: file, type, field — each pickable independently. Snake, kebab, Pascal, camel, preserve.
- **Per-identifier `@name(NewName)` override** — escape hatch for the global naming rule.
- **`@db.X(p, s)` precision** captured as JSDoc so the schema-level info isn't lost.
- **Optional barrel** (`emitIndex = true`) with class-mode awareness (`export { User }` vs. `export type { User }` based on the pattern).
- **Pretty-formatted inline JSON types** — multi-property objects emitted from `@json({ ... })` are broken onto multiple lines for readability instead of collapsed onto one.
- **Zero third-party runtime dependencies** on any published `@polyprism/*` package. `ts-domain-class` consumers gain one PolyPrism-internal dep (`@polyprism/runtime`); everyone else: nothing.

## Quick start

```bash
pnpm add -D prisma @polyprism/ts-interface
```

```prisma
// prisma/schema.prisma
generator polyprismCodegen {
  provider = "polyprism-ts-interface"
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

## The six patterns, side-by-side

Same model. Swap the provider. That's it.

### TypeScript family

<table>
<tr>
<th align="left"><code>polyprism-ts-interface</code></th>
<th align="left"><code>polyprism-ts-type</code></th>
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
</tr>
<tr>
<th align="left"><code>polyprism-ts-class</code></th>
<th align="left"><code>polyprism-ts-domain-class</code></th>
</tr>
<tr>
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
<td>

```ts
import { normalise } from "@polyprism/runtime";
import { Role } from "./enums/Role.js";

export interface UserInit {
  email: string;          // @normalise(trim, lowercase)
  name?: string | null;
  role?: Role;
}

export class User {
  #email!: string;
  #name: string | null = null;
  #role!: Role;

  get email(): string { return this.#email; }
  set email(v: string) {
    this.#email = normalise(v, ["trim","lowercase"] as const);
  }

  // ...getters/setters per field,
  //    builder(), from(), and a
  //    toJSON() override for models
  //    that include BigInt fields.
}
```

</td>
</tr>
</table>

`ts-class` emits real initializer expressions so you can `new User()` and
trust the defaults — Prisma-managed values (cuid/uuid/now/autoincrement) keep
the `!` definite-assignment marker because Prisma assigns them at insert time.

`ts-domain-class` goes a step further: private fields with getter/setter
accessors that run `@normalise` and `@coerce` on assignment, plus a coerce-by-default
policy on `Int` / `Float` / `Decimal` / `BigInt` / `DateTime` so stringified
primitives from JSON bodies, GraphQL responses, and form data get laundered
into the right shape on the way in. `Object.keys(user)` returns the field
names via per-instance enumerable accessors, so `prisma.user.update({ data:
user })` round-trips natively — no `toData()` ceremony. The opinionated
pattern; the trade for setter-driven type safety is one PolyPrism-internal
runtime dep (`@polyprism/runtime`). The other three TS patterns stay
runtime-dep-free.

### PHP family

<table>
<tr>
<th align="left"><code>polyprism-php-class</code> (PHP 8.1+)</th>
<th align="left"><code>polyprism-php-readonly</code> (PHP 8.2+)</th>
</tr>
<tr>
<td>

```php
<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\Role;

final class User
{
    public function __construct(
        public string $id,
        public string $email,
        public ?string $name = null,
        public Role $role = Role::MEMBER,
    ) {}
}
```

</td>
<td>

```php
<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\Role;

final readonly class User
{
    public function __construct(
        public string $id,
        public string $email,
        public ?string $name = null,
        public Role $role = Role::MEMBER,
    ) {}
}
```

</td>
</tr>
</table>

Both PHP patterns use **constructor property promotion** — the canonical
PHP 8 shorthand that declares properties and accepts constructor
parameters in a single block. `php-class` is mutable (`$user->email = 'x'`
works); `php-readonly` is immutable after construction and is the
idiomatic shape for DTOs and value objects.

Generated files land under `<outputDir>/Models/User.php` and
`<outputDir>/Enums/Role.php`. The default namespace is `Generated\Models`
and `Generated\Enums`; wire it into `composer.json` autoload:

```json
{
  "autoload": {
    "psr-4": { "Generated\\": "src/Generated/" }
  }
}
```

**Supported PHP versions**

| Package | Min PHP | What drives the floor |
|---|---|---|
| `@polyprism/php-class` | **8.1** | Backed enums (`enum X: string`), `new \DateTimeImmutable()` in default param values (the "new in initializers" RFC), enum-case defaults (`Role::MEMBER`), the `mixed` type, constructor property promotion |
| `@polyprism/php-readonly` | **8.2** | Everything above plus the class-level `readonly` modifier (per-property `readonly` exists in 8.1, but `final readonly class` is 8.2) |

No upper limit — emitted code is forward-compatible through PHP 8.3, 8.4 (deprecates optional-before-required, which we already sort around), and the planned 9.0. PHP 8.1's security support ended 2025-12; we still target it as the floor because much of the active Composer ecosystem hasn't yet moved. CI lints every emitted file under both 8.1 (floor) and 8.2 (current target) on every push.

**Verified Composer-compliant.** Every push to this repo runs four PHP-side gates against the committed showcase output:
- `php -l` under PHP 8.1 (the php-class floor) and PHP 8.2 (the php-readonly floor) — pure syntax check, no surprises by version.
- `composer dump-autoload --strict-psr` — file-name / namespace / directory layout must all align with PSR-4 or the build fails.
- A smoke script (`examples/php-class-showcase/scripts/smoke.php`) that autoloads through Composer, instantiates every generated class, exercises `final readonly` enforcement, verifies `@hide` actually omits the field from the constructor signature, and round-trips `json_encode`.
- A drift check that regenerates the showcase and `git diff --exit-code`s the result against the committed version — so the renderer can't quietly drift away from what the docs claim.

PHP scalar mapping: `String → string`, `Int → int`, `Float → float`,
`Boolean → bool`, `DateTime → \DateTimeImmutable`, `BigInt → int`
(PHP `int` is 64-bit on every modern target — set `@type("string", ...)`
on a field if you need to round-trip values beyond `PHP_INT_MAX`),
`Decimal → string` (use `brick/math` or BCMath at the consumer to
operate on the values), `Json → mixed` (unless typed via `@json` — see
below), `Bytes → string`. Enums emit as PHP 8.1+ backed enums
(`enum Role: string { case ADMIN = 'ADMIN'; }`).

`@hide`, `@deprecated`, `@name`, `@type`, and `@json` (inline forms)
work the same way they do in the TypeScript family. For inline `@json`
shapes, PolyPrism generates a `final readonly class` under
`<outputDir>/JsonTypes/<Name>.php` and types the Json field as that
class:

```prisma
/// @json(BillingAddress = { street: string, city: string, country: string })
address Json
```

```php
// Generated/JsonTypes/BillingAddress.php
final readonly class BillingAddress {
    public function __construct(
        public string $street,
        public string $city,
        public string $country,
    ) {}
}

// Generated/Models/User.php
use Generated\JsonTypes\BillingAddress;
final class User {
    public function __construct(
        public BillingAddress $address,
    ) {}
}
```

Supported `@json` shapes: primitives (`string`, `number → float`,
`boolean`, `unknown`/`any → mixed`), arrays of primitives
(`tags: string[]` → PHP `array` + PHPDoc `array<int, string>`), nested
objects (PHPDoc `array{...}` shape on a plain `array` property — no
sub-classes spawned), and `name?: type` optional markers. Anything
outside that subset (unions, generics, identifier references) emits a
warning and falls back to `mixed` — use `@type("\\App\\YourType")` to
point at a hand-written PHP class for richer typing.

Bare (`@json(SomeType)`) and with-path (`@json(SomeType from "./path")`)
forms warn and fall back to `mixed` — they trust TypeScript module
imports that don't translate to PHP autoloading. Use `@type` instead.

`@coerce` / `@normalise` / `@noCoerce` are parsed but ignored in v0 —
those are property-hook features that need PHP 8.4 and will ship as a
future `@polyprism/php-domain-class`.

Both PHP classes are emitted as `final`. That's deliberate: regenerated
DTOs whose shape can change with the schema shouldn't be silently broken
by hand-written subclasses. Use **composition over inheritance** for
domain logic — wrap the generated class or pass it to a service. See
[`@polyprism/php-class`'s README](packages/php-class/README.md#why-final)
for the worked example.

## Annotation reference

All annotations live in Prisma triple-slash doc comments (`///`).

| Annotation | What it does |
|---|---|
| `@hide` | Drop a field/enum-value from the generated output entirely. |
| `@deprecated("reason")` | Emit a `@deprecated` JSDoc tag on the field/model/enum. Reason is optional. |
| `@json(Type)` | Brand a `Json` field with a TypeScript type. See [4 forms](#json-annotation--four-forms) below. |
| `@type(MyType from "./path")` | Override the inferred TS type. The `from "./path"` half is optional. |
| `@name(NewIdent)` | Rename the emitted identifier for a model/enum/field (escapes global casing). |
| `@normalise(trim, lowercase, uppercase, nullEmptyToNull)` | Apply string-normalisation ops on assignment (`ts-domain-class` only). Parsed but ignored by the other three patterns. |
| `@coerce(target)` | Override the default coercion for a field (`ts-domain-class` only — `String @coerce(int)` etc). |
| `@noCoerce` | Opt a default-coerce field (`Int`, `Float`, `Decimal`, `BigInt`, `DateTime`) out of widened setter input on `ts-domain-class`. |

### `@json` annotation — four forms

```prisma
// 1. Bare — user is responsible for the type being importable.
/// @json(UserMetadata)
metadata Json

// 2. With explicit import path — we emit the import for you.
/// @json(BillingAddress from "./types/billing")
address Json

// 2a. Array combo — imports the singular type, emits the field type as Type[].
/// @json(Tag[] from "./types/tag")
tags Json @default("[]")

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

// Arrays: use TS array syntax inside the parens. `@json([Tag])` looks tempting
// but is a single-element tuple in TS — PolyPrism DWIM-rewrites it to `Tag[]`
// with a warning. Prefer the explicit form:
/// @json(Tag[])
tags Json @default("[]")
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

| | PolyPrism | prisma-class-generator | zod-prisma-types | prismabox |
|---|---|---|---|---|
| Multi-pattern from one config | ✅ | ❌ (classes only) | ❌ (Zod only) | ❌ (TypeBox only) |
| Prisma 7 native (ESM-only) | ✅ | ❌ | ⚠️ | ⚠️ |
| Standalone enum files | ✅ (always-on) | ❌ | ✅ | ✅ |
| Zero runtime deps on published pkgs | ✅ | ❌ | ❌ | ❌ |
| Decimal as `Decimal` (not `number`) | ✅ | ❌ (emits `number`) | ✅ | ✅ |

## Examples

Five example schemas live in `examples/` — each picks a different pattern
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
- **[`examples/domain-class-showcase/`](examples/domain-class-showcase)** —
  billing/orders schema using `ts-domain-class`. Exercises every default-coerce
  type, every `@normalise` op, `@noCoerce`, `@coerce(target)`, inline `@json`,
  relations (1-to-1, 1-to-many, self-reference), and the `Init`-interface
  required-vs-optional split. The generated output is committed to git so
  you can diff schema changes against emitted code without running the
  generator yourself.
- **[`examples/php-class-showcase/`](examples/php-class-showcase)** —
  billing/orders schema using `php-class`. Mirrors the domain-class shape
  on the PHP side: every PHP scalar mapping, enums with defaults, 1-to-many
  + self-referencing relations, every default kind (literal, enum case,
  `now()`, unrepresentable `cuid()`), and the annotation set (`@hide`,
  `@deprecated`, `@name`, `@type`, and the `@json` warning-and-fallback).
  Generated output committed to git.

## Roadmap

| Version | State | Adds |
|---|---|---|
| **0.1** | shipped | `ts-interface`, `ts-type`, `ts-class`, **`ts-domain-class`** (with setter-driven `@normalise`/`@coerce`, `from()`, `toJSON()`, fluent builder), `@polyprism/runtime` helpers, 8 annotations, three-axis naming, enum + JSON-type file emission |
| **0.2** | next | **PHP emitter family** — `php-class` (PHP 8.1+) and `php-readonly` (PHP 8.2+). Constructor property promotion, PHP 8.1+ backed enums, typed `@json` value classes under `JsonTypes/`, PSR-4-compatible file layout. Diagnostic-surface polish on the TS family (emit-time issues flowing through a proper reporter instead of being silently dropped) also lands in this release. |
| 0.3 | planned | `ts-zod` — Zod schema emission, sharing the same naming and annotation pipeline as the type-shape patterns. Also: `php-domain-class` with PHP 8.4 property hooks + a Composer-published `polyprism/runtime` for setter-driven `@coerce`/`@normalise` on PHP. |
| 1.0 | planned | Docs site, JSON-Schema-validated config, public stability commitment on the emitter API |
| Later | — | `ts-valibot`, `ts-arktype`, `ts-typebox`, `ts-effect-schema`, `ts-standard-schema`, Go and Rust emitter families |

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
setup and workflow. By participating you agree to the project's
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Travis Fitzgerald
