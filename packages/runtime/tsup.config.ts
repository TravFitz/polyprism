import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  // Dual ESM + CJS output. This is the one PolyPrism package that ships
  // *runtime* code consumers actually require (the others ship generator
  // bins that Prisma spawns out-of-process — those can stay ESM-only).
  // CJS-flavoured test runners like ts-jest can't `require()` a pure-ESM
  // package: Node throws ERR_REQUIRE_ESM. Shipping a CJS sibling unblocks
  // every ts-jest / Mocha-without-loader / pre-ESM consumer without
  // forcing them into per-project transformIgnorePatterns workarounds.
  format: ["esm", "cjs"],
  dts: true,
  bundle: false,
  clean: true,
  target: "node22",
  sourcemap: true,
});
