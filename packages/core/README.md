# @omniprism/core

Internal package — the language-agnostic IR, DMMF reader, annotation parser,
naming resolver, and generator runtime that powers every `@omniprism/*`
pattern package.

You probably don't want to install this directly. Pick a pattern package:

- [`@omniprism/ts-interface`](../ts-interface) — `export interface User { ... }`
- [`@omniprism/ts-type`](../ts-type) — `export type User = { ... };`
- [`@omniprism/ts-class`](../ts-class) — `export class User { ... }`

See the [root README](../../README.md) for the project overview, annotation
reference, and full feature list.

## Public API

This package exports:

- IR types (`ModelDef`, `FieldDef`, `EnumDef`, `AnnotationSet`, etc.)
- Annotation parser (`parseAnnotations`)
- Naming resolver (`resolveTypeIdent`, `resolveFieldIdent`, `resolveTypeFilename`)
- Generator runtime (`defineGenerator`, `GeneratorContext`)
- Shared emitter helpers (`emitEnums`, `emitJsonTypes`, `prettyFormatType`,
  `createInMemoryFileWriter`)

The DMMF reader is internal — it is **never** exposed publicly. This is what
lets pattern packages have zero third-party runtime dependencies.

## License

[MIT](../../LICENSE) © Travis Fitzgerald
