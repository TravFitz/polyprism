---
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Hot-fix for `@polyprism/runtime@0.1.6`: the CJS sibling crashed under
ts-jest with `Unexpected token 'export'`.

**The bug.** tsup with `bundle: false` + multi-entry preserved the
source-level `from "./coerce.js"` literals in the CJS output as
`require("./coerce.js")` — pointing at the ESM-format `.js` siblings
instead of the `.cjs` ones. With the package's `"type": "module"`,
those `.js` files are ESM. Node-as-CJS resolving the require chain
hit `export { ... }` syntax and choked.

Node 22's experimental `require(esm)` support masked the failure on
the maintainer's dev machine (which is how it shipped in 0.1.6 despite
the cjs-load test passing locally). ts-jest and any other strict CJS
context — Mocha-without-loader, Node 20, Node 22 with the flag off —
all hit the syntax error at module load.

**The fix.** Switch tsup to `bundle: true` with a single
`entry: ["src/index.ts"]`. Bundling per format inlines coerce +
normalise into each output (`dist/index.js` + `dist/index.cjs`),
eliminating internal requires entirely. The runtime is ~70 LOC; the
tree-shakeability cost is negligible (bundled size: 3.41 KB CJS /
2.23 KB ESM), and modern bundlers still tree-shake the ESM named
exports on the consumer side.

**The regression gate.** New file-content assertion in
`packages/runtime/tests/cjs-load.test.ts` greps the bytes of
`dist/index.cjs` for any internal `require("./...")` calls and
asserts the match array is empty. The previous "does it load?" test
PASSED on Node 22 with `require(esm)` enabled — so this regex gate
runs against the published bytes independent of host Node version,
catching the regression class at source.

**Framing softened**: runtime's README and package.json description
shift from "Dual ESM + CJS" to "ESM-first, with a CJS sibling for
legacy test runners". ESM stays the primary contract; CJS is the
escape hatch for ts-jest / Mocha-without-loader. The other six
`@polyprism/*` packages remain pure ESM (they ship generator bins
Prisma spawns out-of-process — no consumer ever `require()`s them).

Patch bump across the fixed-version-locked group.
