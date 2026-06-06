// TypeScript-flavoured wrapper around `@polyprism/core`'s language-neutral
// `resolveCoerceKind`. The core helper inspects the IR and decides which
// setter shape applies (strict, coerce-int, coerce-date, etc); this file
// translates that into the TS-specific output the renderer needs — the
// widened TS type for the setter parameter and the matching
// `@polyprism/runtime` function name.
//
// Only the domain-class renderer consumes this module. ts-interface,
// ts-type, and ts-class continue to ignore `@coerce` / `@noCoerce` /
// `@normalise`.

import {
  type CoerceKind,
  type CoerceRulesIssue,
  type FieldDef,
  resolveCoerceKind,
} from "@polyprism/core";

export type { CoerceKind, CoerceRulesIssue } from "@polyprism/core";

export interface CoerceDecision {
  readonly kind: CoerceKind;
  /**
   * The exact runtime helper to import from `@polyprism/runtime`, or `null`
   * for `strict` and `coerce-decimal` (Decimal is inlined per-model using
   * the consumer's existing `Decimal` import from
   * `@prisma/client/runtime/library`) and `coerce-string` (inlined `String()`).
   */
  readonly runtimeFn: "coerceInt" | "coerceFloat" | "coerceBigInt" | "coerceDate" | null;
  /**
   * Widened TS input type for the setter parameter. For `strict` this
   * matches the declared field type; for coerce variants it widens to
   * accept the untrusted-boundary forms.
   */
  readonly setterInputType: string;
}

export interface CoerceRulesResult {
  readonly decision: CoerceDecision;
  readonly issues: readonly CoerceRulesIssue[];
}

/**
 * Resolve the setter strategy + any issues for a single field.
 *
 * @param field         The FieldDef from the IR
 * @param modelName     Schema-level model name (used in field paths for error messages)
 * @param declaredType  The TS type the field's getter will return (after type-mapper).
 *                      Used as the strict input type for the `strict` kind.
 */
export function resolveCoerceDecision(
  field: FieldDef,
  modelName: string,
  declaredType: string,
): CoerceRulesResult {
  const { kind, issues } = resolveCoerceKind(field, modelName);
  return {
    decision: formatTsDecision(kind, declaredType),
    issues,
  };
}

function formatTsDecision(kind: CoerceKind, declaredType: string): CoerceDecision {
  switch (kind) {
    case "strict":
      return { kind, runtimeFn: null, setterInputType: declaredType };
    case "coerce-int":
      return {
        kind,
        runtimeFn: "coerceInt",
        setterInputType: "number | string",
      };
    case "coerce-float":
      return {
        kind,
        runtimeFn: "coerceFloat",
        setterInputType: "number | string",
      };
    case "coerce-bigint":
      return {
        kind,
        runtimeFn: "coerceBigInt",
        setterInputType: "bigint | number | string",
      };
    case "coerce-date":
      return {
        kind,
        runtimeFn: "coerceDate",
        setterInputType: "Date | string | number",
      };
    case "coerce-decimal":
      return {
        kind,
        runtimeFn: null,
        setterInputType: "Decimal | number | string",
      };
    case "coerce-string":
      return {
        kind,
        runtimeFn: null,
        setterInputType: "string | number | boolean | bigint",
      };
  }
}
