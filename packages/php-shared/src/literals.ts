// Small helpers for emitting PHP literal expressions safely.
//
// Kept in a dedicated module so callers across the PHP family (render-model,
// render-domain-class, and any future renderers that need to emit user-
// controlled values into source code) share a single, correct escaper.

import type { NormaliseOp } from "@polyprism/core";

/**
 * Render a PHP single-quoted string literal. Single quotes don't process
 * escapes other than `\\` and `\'`, so the encoder only needs to escape
 * those two characters.
 *
 * Single-quoted strings are preferred over double-quoted because PHP's
 * double-quoted strings interpolate `$variable` references — which would
 * be a quiet injection hazard if a schema value ever started with `$`.
 */
export function phpSingleQuote(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/**
 * Render a `NormaliseOp` identifier as the PHP class constant the
 * `polyprism/runtime` Composer package exposes.
 *
 * The renderer emits the constant reference (`Normalise::TRIM`) rather
 * than the raw op string (`'trim'`) so a typo in this mapping is a
 * compile-time error in the generated PHP rather than a silent no-op at
 * runtime — and so renames on the runtime side are caught at codegen.
 *
 * This is the single source of truth: any new `NormaliseOp` variant has
 * to extend this switch AND ship a matching `Normalise::*` class constant
 * in `packages/runtime-php/src/Normalise.php`. Keeping them adjacent
 * (one in `@polyprism/core`'s `NormaliseOp` union, one in the runtime
 * package, one here) is the load-bearing contract.
 */
export function phpNormaliseOpConstant(op: NormaliseOp): string {
  switch (op) {
    case "trim":
      return "Normalise::TRIM";
    case "lowercase":
      return "Normalise::LOWERCASE";
    case "uppercase":
      return "Normalise::UPPERCASE";
    case "nullEmptyToNull":
      return "Normalise::NULL_EMPTY_TO_NULL";
  }
}
