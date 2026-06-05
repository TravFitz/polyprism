---
"@polyprism/ts-shared": minor
---

Surface previously-dropped emit-time diagnostics through a new `Diagnostic` interface and an optional `onDiagnostic` callback on `emitModels`.

Two kinds of issues used to disappear silently:

- `AnnotationSet.parseIssues` — recorded by the annotation parser when a `///` directive was malformed (wrong arity, unknown form), then stored on the IR and never read.
- `RenderDomainClassResult.issues` — emitted by `coerce-rules.ts` when domain-class hit a contradiction (`@coerce` on a `Boolean`, `@noCoerce` on a strict-by-default type, reserved-name collisions like fields named `constructor`), then dropped at the `render-model.ts` dispatch site for string-output compatibility.

Both now flow through the unified `Diagnostic` surface. `emitModels` takes an optional `onDiagnostic` callback (defaults to stderr) and throws at the end of the pipeline if any error-severity diagnostics were collected — so generator runs fail visibly instead of producing half-correct output with no signal. Diagnostics carry `Model.field` / `Enum.VALUE` context strings; schema source line numbers are deferred to a future v0.x (DMMF doesn't expose source positions, so threading them in would require a custom mini-parser; not justified yet).

The reserved-name collision tests (`constructor` / `__proto__`) were rewritten — they used to silently drop the offending field while pretending the build succeeded; they now assert on the throw and on the captured diagnostic. This is a behaviour change but only fires for `ts-domain-class` schemas that actually contain those reserved field names, which is vanishingly unlikely in practice.

**Public API note**: `renderModel` previously returned `string`; it now returns `{ source: string; issues: readonly Diagnostic[] }`. `@polyprism/ts-shared` is documented as a transitive-only package (consumers depend on `@polyprism/ts-interface` / `ts-type` / `ts-class` / `ts-domain-class`, which call `emitModels`, not `renderModel`), so this is not expected to affect any downstream consumer. If you somehow are calling `renderModel` directly, destructure `.source` to keep the prior behaviour.
