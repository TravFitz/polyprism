---
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Fix `@json([Type])` silently emitting a tuple-of-one TypeScript type.

A user dogfooding `@polyprism/ts-domain-class` against a real production
schema (with a `Json` column meant to hold an array) reached for the
natural-feeling syntax `/// @json([CountryConfiguration])` after reading
the README's mention of the `/// [TypeName]` line-level shorthand. The
parser was passing `[CountryConfiguration]` straight through as a Form 3
inline-anonymous type expression, which TypeScript reads as a
single-element tuple — silently corrupting any consumer that mapped,
pushed, or filtered over more than one element.

`@polyprism/core`'s `parseJsonArgs` now detects the
`@json([SingleIdent])` pattern, DWIM-rewrites it to
`@json(SingleIdent[])` (the user's almost-certain intent — array of X),
and pushes a parse-time warning into `AnnotationSet.parseIssues`.
Multi-element bracket forms (`@json([A, B])`) pass through unchanged
because they're legitimate tuple literals. The trailing-comma form
`@json([X, ])` is the escape hatch for the rare genuinely-tuple-of-one
case.

The warning surfaces in `@polyprism/ts-domain-class` output today via
the renderer's issue collector. Surfacing parse issues in
`ts-interface` / `ts-type` / `ts-class` output is a known follow-up
(`packages/ts-shared/src/render-model.ts:46-48` already calls this
out as deferred); those consumers get the silently-correct
DWIM-rewritten type for now.

Root README's `@json` section gains an explicit example documenting the
array form (`@json(Tag[])`) so future readers don't fall into the same
trap.

No code changes outside `@polyprism/core`'s parser + tests + the root
README; every other published package patches under the fixed-version
lockstep rule.
