# @polyprism/ts-domain-class

A Prisma 6 & 7 generator that emits opinionated TypeScript **domain classes** from your `schema.prisma`. Private fields, getters/setters with setter-driven data laundering, `from()` static factory, `toJSON()`, and a fluent builder. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```ts
const order = new Order({
  customerId: "cus_123",
  total: "10.99",         // stringified money from an HTTP API → coerced to Decimal
  placedAt: "2026-06-02", // ISO string → coerced to Date
});

await prisma.order.create({ data: order });  // pass directly — no destructure
```

**Pure ESM, Prisma 7-native, one runtime dep ([`@polyprism/runtime`](https://www.npmjs.com/package/@polyprism/runtime)).** CI tests against both Prisma 6 and Prisma 7. The runtime dep is the price of admission for setter-driven data casting; the other PolyPrism patterns (`ts-interface`, `ts-type`, `ts-class`) stay zero-runtime-dep.

## Install

```bash
pnpm add -D prisma @polyprism/ts-domain-class
pnpm add @polyprism/runtime
```

Note the split: the generator is a `devDependency`, the runtime is a real `dependency`.

## Configure

```prisma
generator polyprismCodegen {
  provider = "polyprism-ts-domain-class"
  output   = "../generated"
}
```

> ⚠️ The provider string is the **bin name** (no `@scope/` prefix).

## Run

```bash
pnpm prisma generate
```

## What you get

- **Setter-driven type laundering** — `Int` / `Float` / `Decimal` / `BigInt` / `DateTime` fields coerce by default. Strings, booleans, enums, relations, and JSON columns stay strict.
- **`@noCoerce`** to opt a default-coerce field out (e.g. an internal counter you want strictly typed).
- **`@coerce(target)`** to opt a strict-by-default field in (e.g. `String @coerce(int)` for legacy stringified columns).
- **`@normalise(trim, lowercase, uppercase, nullEmptyToNull)`** to pipe string-typed fields through ordered transforms on assignment.
- **Constructor**: `new User({ ... })` — object-arg with defaults applied for fields that have them.
- **Prisma-friendly**: `prisma.user.create({ data: userInstance })` works directly because the instance exposes enumerable accessors. No `toData()` plumbing.
- **JSON-safe**: `JSON.stringify(userInstance)` produces wire-safe output natively. Models with `BigInt` columns also get a custom `toJSON()` so `JSON.stringify` doesn't throw on bigints.
- **`User.from(plainObject)`** static factory — hydrate a class instance from an untrusted shape (HTTP body, Prisma row, queue message). Assigns via setters so `@coerce` / `@normalise` fire on the way in; unknown keys are silently dropped.
- **`User.builder()...build()`** fluent builder with one chainable method per init-writable field.
- Everything `ts-class` gives you (standalone enum files, three-axis naming, JSDoc preservation, `@db.X` precision metadata, etc.).

## Sibling patterns

- [`@polyprism/ts-interface`](https://www.npmjs.com/package/@polyprism/ts-interface) — `export interface User { ... }`
- [`@polyprism/ts-type`](https://www.npmjs.com/package/@polyprism/ts-type) — `export type User = { ... };`
- [`@polyprism/ts-class`](https://www.npmjs.com/package/@polyprism/ts-class) — `export class User { ... }` with public fields (no setter pipeline)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
