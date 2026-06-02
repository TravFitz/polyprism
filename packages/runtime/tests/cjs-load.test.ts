// Smoke test: the built CJS sibling can be `require()`'d and exposes the same
// named exports as the ESM entry. Gates the dual ESM+CJS build against
// regressions that would re-break the ts-jest / CJS-test-runner load path.
//
// Why this exists: 0.1.5 shipped pure-ESM and crashed at module-load under
// `ts-jest` + `transformIgnorePatterns` (Node's default for node_modules
// transforms). Adding a CJS sibling to the package's `exports` map fixed
// the crash; this test makes sure we don't accidentally drop it again.
//
// We test against the built artifacts in dist/ rather than via
// `require("@polyprism/runtime")` because vitest resolves the workspace
// package's "polyprism-source" export condition (mapping to src/*.ts),
// which bypasses the publish-shape verification we actually want here.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cjsRequire = createRequire(import.meta.url);
const here = fileURLToPath(new URL(".", import.meta.url));
const cjsEntry = join(here, "..", "dist", "index.cjs");

describe("@polyprism/runtime — CJS load path", () => {
  it("dist/index.cjs exists (dual build emitted both ESM and CJS)", () => {
    expect(existsSync(cjsEntry)).toBe(true);
  });

  it("require('./dist/index.cjs') loads cleanly and exposes the full public API", () => {
    if (!existsSync(cjsEntry)) {
      // Fresh checkout without a build — skip rather than fail noisily.
      // The "dist/index.cjs exists" assertion above is the gate.
      return;
    }
    const rt = cjsRequire(cjsEntry);
    expect(typeof rt.coerceInt).toBe("function");
    expect(typeof rt.coerceFloat).toBe("function");
    expect(typeof rt.coerceBigInt).toBe("function");
    expect(typeof rt.coerceDate).toBe("function");
    expect(typeof rt.normalise).toBe("function");
    expect(typeof rt.normaliseNullable).toBe("function");
  });

  it("CJS-loaded coerceInt enforces the same contract as the ESM build (fractional rejection)", () => {
    if (!existsSync(cjsEntry)) return;
    const rt = cjsRequire(cjsEntry);
    expect(() => rt.coerceInt(1.5, "T.f")).toThrowError(/Cannot coerce 1.5 to int/);
  });

  it("dist/index.cjs is self-contained — no internal `require()` of ESM siblings", () => {
    // Regression gate for the 0.1.6 ship bug: tsup with `bundle: false`
    // preserved the source-level `from "./coerce.js"` literal in the CJS
    // output as `require("./coerce.js")`. With the package's `"type":
    // "module"`, those `.js` siblings are ESM-format. Node-as-CJS resolving
    // the require chain then hit `Unexpected token 'export'` parsing the
    // ESM file (ts-jest, Mocha, anything stricter than Node 22's
    // experimental require-esm support).
    //
    // The `dist/index.cjs is loadable` test above CAN'T catch this on
    // dev machines running Node 22 with `require(esm)` enabled — that
    // feature silently allowed the ESM file to load through `require()`,
    // masking the failure in CI and local smoke. This regex check runs
    // against the bytes of the published artifact, independent of the
    // host Node version. Bundling per-format means there are no internal
    // requires at all; if any reappear, this test catches them before
    // they hit consumers.
    if (!existsSync(cjsEntry)) return;
    const content = readFileSync(cjsEntry, "utf8");
    const internalRequires = content.match(/require\(["']\.\.?\/[^"')]+["']\)/g) ?? [];
    expect(internalRequires).toEqual([]);
  });
});
