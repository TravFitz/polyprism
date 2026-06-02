# @polyprism/runtime

Runtime helpers used by [`@polyprism/ts-domain-class`](https://www.npmjs.com/package/@polyprism/ts-domain-class) — PolyPrism's opinionated domain-class pattern. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

**Pure ESM, zero third-party runtime dependencies.** The one PolyPrism runtime dep — only required when you choose the domain-class pattern. Users of `ts-interface`, `ts-type`, and `ts-class` never see this package.

## What it does

Generated domain-class setters apply `@normalise` and `@coerce` semantics on assignment by routing through this package instead of inlining the same logic into every model file. That keeps generated code small, the conversion logic centrally tested, and bundle output tree-shakeable.

## Public API

```ts
import {
  normalise,
  normaliseNullable,
  coerceInt,
  coerceFloat,
  coerceBigInt,
  coerceDate,
  type NormaliseOp,
} from "@polyprism/runtime";
```

| Export | Purpose |
|---|---|
| `normalise(v, ops)` | Apply an ordered list of string-normalisation ops (`trim`, `lowercase`, `uppercase`) to a string |
| `normaliseNullable(v, ops)` | Same but tolerates `null` and supports the `nullEmptyToNull` op |
| `coerceInt(v, fieldPath)` | Coerce `number \| string` → `number` (integer); throws `TypeError` on invalid input with the field path in the message |
| `coerceFloat(v, fieldPath)` | Coerce `number \| string` → `number` (float); throws on invalid input |
| `coerceBigInt(v, fieldPath)` | Coerce `bigint \| number \| string` → `bigint`; throws on invalid input |
| `coerceDate(v, fieldPath)` | Coerce `Date \| string \| number` → `Date`; throws on invalid date |
| `NormaliseOp` | `"trim" \| "lowercase" \| "uppercase" \| "nullEmptyToNull"` |

`Decimal` coercion is **not** in this package — the generated model already imports `Decimal` from `@prisma/client/runtime/library`, so its coercion (`v instanceof Decimal ? v : new Decimal(v)`) is inlined per-model and the runtime stays Prisma-free.

## Why a separate runtime package

See the [PolyPrism root README](https://github.com/TravFitz/polyprism) for the design rationale: the trade is opt-in per-pattern. Choosing `polyprism-ts-domain-class` in your `schema.prisma` adds one runtime dep (`@polyprism/runtime`) in exchange for setter-driven type laundering, `@normalise` / `@coerce` behaviour, and the `from()` / `toJSON()` ergonomics — none of which you have to write yourself.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
