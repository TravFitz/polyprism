# @omniprism/ts-shared

Internal package — TypeScript-specific rendering shared by every `ts-*`
pattern in OmniPrism (`ts-interface`, `ts-type`, `ts-class`).

You probably don't want to install this directly. Pick a pattern package:

- [`@omniprism/ts-interface`](../ts-interface) — `export interface User { ... }`
- [`@omniprism/ts-type`](../ts-type) — `export type User = { ... };`
- [`@omniprism/ts-class`](../ts-class) — `export class User { ... }`

See the [root README](../../README.md) for the project overview.

## What lives here

- `renderModel({ declarationStyle })` — emits one model file, parameterised
  by `"interface" | "type" | "class"`.
- `renderIndex({ declarationStyle })` — emits the optional barrel.
- `mapFieldTsType` — IR field → TS type expression.
- `ImportCollector` — deduped, sorted, type-vs-value-aware import block builder.
- `renderJsDoc` — JSDoc emission for docs, `@deprecated`, and `@db.X(...)` tags.

## License

[MIT](../../LICENSE) © Travis Fitzgerald
