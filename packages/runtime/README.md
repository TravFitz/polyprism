# @polyprism/runtime

Runtime helpers used by [`@polyprism/ts-domain-class`](https://www.npmjs.com/package/@polyprism/ts-domain-class) — PolyPrism's opinionated domain-class pattern. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

**ESM-first, with a CJS sibling for legacy test runners. Zero third-party runtime dependencies.** The one PolyPrism runtime dep — only required when you choose the domain-class pattern. Users of `ts-interface`, `ts-type`, and `ts-class` never see this package.

ESM is the primary contract (`import { coerceInt } from "@polyprism/runtime"`). Vitest, Jest with `--experimental-vm-modules`, Bun, Deno, and any modern bundler all resolve to the ESM entry naturally and need no extra configuration.

## Using from ts-jest / other CJS test runners

If your test runner loads modules through Node's CJS resolver (default ts-jest, Mocha without an ESM loader, etc.), there are two ways to consume this package. Pick one — both work, the tradeoff is "small config tweak" vs "slightly older code path."

### Recommended: let your test runner transform PolyPrism

Add `@polyprism/*` to your `transformIgnorePatterns` allowlist so Jest transforms our ESM source the same way it transforms your own:

```js
// jest.config.js / jest.config.ts
export default {
  transformIgnorePatterns: ["/node_modules/(?!@polyprism/)"],
  // ...rest of your config
};
```

This gives you the modern ESM entry on every code path — same module instance your production code uses, same source maps, no surprises. Recommended whenever you have control over the Jest config.

### Fallback: the CJS sibling

If editing Jest config is awkward (vendored config, shared monorepo preset, etc.), the package ships a CJS sibling that `require()` resolves to automatically — no config needed, it just works:

```ts
const { coerceInt } = require("@polyprism/runtime");
```

The CJS build is a self-contained bundle (no internal `require()` of ESM siblings), so it loads cleanly under any CJS runtime regardless of Node version or experimental flags.

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
