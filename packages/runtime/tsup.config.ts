import { defineConfig } from "tsup";

export default defineConfig({
  // Single entry point — we deliberately do NOT use `src/**/*.ts` because:
  //
  //   1. Bundling per format (`bundle: true` below) needs a single entry
  //      to produce a self-contained output. With multiple entries, tsup
  //      would emit `coerce.js` / `normalise.js` siblings that the
  //      `index.cjs` bundle would still try to reference.
  //
  //   2. The package's `exports` map only declares the `.` entry — deep
  //      imports like `@polyprism/runtime/coerce` aren't supported, so
  //      emitting per-file output is wasted work.
  entry: ["src/index.ts"],
  // Dual ESM + CJS output. This is the one PolyPrism package that ships
  // *runtime* code consumers actually require (the others ship generator
  // bins that Prisma spawns out-of-process — those can stay ESM-only).
  // CJS-flavoured test runners like ts-jest can't `require()` a pure-ESM
  // package: Node throws ERR_REQUIRE_ESM. Shipping a CJS sibling unblocks
  // every ts-jest / Mocha-without-loader / pre-ESM consumer without
  // forcing them into per-project transformIgnorePatterns workarounds.
  format: ["esm", "cjs"],
  dts: true,
  // Bundle ON. Critical for the dual-format build: with `bundle: false`,
  // tsup preserved the source-level `from "./coerce.js"` literal in the
  // CJS output as `require("./coerce.js")`, which Node-as-CJS then
  // resolved to the *ESM* sibling `dist/coerce.js` and crashed parsing
  // `export { ... }`. Bundling inlines coerce + normalise into the
  // single per-format output (`dist/index.js` and `dist/index.cjs`),
  // eliminating the internal-require problem entirely. The runtime is
  // ~70 LOC total; tree-shakeability cost is negligible.
  bundle: true,
  clean: true,
  target: "node22",
  sourcemap: true,
});
