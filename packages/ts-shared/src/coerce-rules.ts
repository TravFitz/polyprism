// Decision matrix for ts-domain-class setter emission.
//
// For each FieldDef, returns:
//   - which setter shape to emit (strict, or one of several coerce flavours)
//   - any emit-time warnings or errors to surface
//
// The default behaviour is "coerce by default on types that commonly arrive
// as stringified primitives from untrusted boundaries (Int / Float / Decimal
// / BigInt / DateTime), strict by default elsewhere". Two annotations can
// override:
//   - @noCoerce flips a default-coerce field to strict
//   - @coerce(target) opts a strict-by-default field in to cross-type
//     coercion (e.g. String @coerce(int) for legacy stringified columns)
//
// Only domain-class renderer consumes this module. ts-interface, ts-type,
// and ts-class continue to ignore @coerce / @noCoerce / @normalise.

import type { FieldDef, FieldType, ScalarType } from "@polyprism/core";

export type CoerceKind =
  | "strict"
  | "coerce-int"
  | "coerce-float"
  | "coerce-bigint"
  | "coerce-date"
  | "coerce-decimal"
  | "coerce-string";

export interface CoerceDecision {
  readonly kind: CoerceKind;
  /**
   * The exact runtime helper to import from `@polyprism/runtime`, or `null`
   * for `strict` and `coerce-decimal` (Decimal is inlined per-model using
   * the consumer's existing `Decimal` import from `@prisma/client/runtime/library`).
   */
  readonly runtimeFn: "coerceInt" | "coerceFloat" | "coerceBigInt" | "coerceDate" | null;
  /**
   * Widened TS input type for the setter parameter. For `strict` this matches
   * the declared field type; for coerce variants it widens to accept the
   * untrusted-boundary forms.
   */
  readonly setterInputType: string;
}

export interface CoerceRulesIssue {
  readonly severity: "error" | "warning";
  readonly fieldPath: string;
  readonly message: string;
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
 *                      Used as the strict input type and as the base for widening.
 */
export function resolveCoerceDecision(
  field: FieldDef,
  modelName: string,
  declaredType: string,
): CoerceRulesResult {
  const fieldPath = `${modelName}.${field.name}`;
  const issues: CoerceRulesIssue[] = [];

  const { coerce, noCoerce, normalise } = field.annotations;

  // Lists short-circuit to strict — per-element coercion in v0.2 is out of scope.
  // The annotation is preserved on the field but ignored on list-typed fields.
  if (field.isList) {
    if (coerce !== null || noCoerce || (normalise && normalise.length > 0)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message:
          "@coerce / @noCoerce / @normalise are ignored on list fields in v0.2 (per-element coercion is not supported).",
      });
    }
    return {
      decision: strictDecision(declaredType),
      issues,
    };
  }

  // Relations + Json + Bytes + unsupported → always strict.
  if (
    field.type.kind === "relation" ||
    field.type.kind === "unsupported" ||
    (field.type.kind === "scalar" &&
      (field.type.scalar === "Json" || field.type.scalar === "Bytes"))
  ) {
    if (coerce !== null || (normalise && normalise.length > 0)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message: `@coerce / @normalise have no effect on ${describeFieldType(field.type)} fields (silently ignored).`,
      });
    }
    return { decision: strictDecision(declaredType), issues };
  }

  // Enum → strict. No sane string→enum coercion ("admin" vs "ADMIN" varies per team).
  if (field.type.kind === "enum") {
    if (coerce !== null || (normalise && normalise.length > 0)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message:
          "@coerce / @normalise have no effect on enum fields. Use @name() to rename the enum or pre-coerce at the boundary.",
      });
    }
    return { decision: strictDecision(declaredType), issues };
  }

  // From here on, field.type.kind === "scalar"
  const scalar = field.type.scalar;

  // Explicit @coerce(target): override path (cross-type or redundant).
  if (coerce !== null) {
    if (scalar === "Boolean") {
      issues.push({
        severity: "error",
        fieldPath,
        message:
          "@coerce is not supported on Boolean fields — no sane default for truthy/falsy strings. Pre-coerce at the boundary.",
      });
      return { decision: strictDecision(declaredType), issues };
    }
    if (noCoerce) {
      issues.push({
        severity: "warning",
        fieldPath,
        message:
          "@coerce and @noCoerce are both present; @coerce wins. Remove one to silence this warning.",
      });
    }
    if (coerceTargetMatchesScalar(coerce, scalar)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message: `@coerce(${coerce}) is redundant — ${scalar} already coerces by default. Remove the annotation.`,
      });
    }
    return {
      decision: decisionForExplicitCoerce(coerce, declaredType),
      issues,
    };
  }

  // @noCoerce on a strict-by-default scalar → warning, but emit strict anyway.
  if (noCoerce) {
    if (!isDefaultCoerceScalar(scalar)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message: `@noCoerce has no effect on ${scalar} fields (they are strict by default already).`,
      });
    }
    return { decision: strictDecision(declaredType), issues };
  }

  // No explicit annotations — apply type-based default.
  switch (scalar) {
    case "Int":
      return {
        decision: {
          kind: "coerce-int",
          runtimeFn: "coerceInt",
          setterInputType: "number | string",
        },
        issues,
      };
    case "Float":
      return {
        decision: {
          kind: "coerce-float",
          runtimeFn: "coerceFloat",
          setterInputType: "number | string",
        },
        issues,
      };
    case "Decimal":
      return {
        decision: {
          kind: "coerce-decimal",
          runtimeFn: null,
          setterInputType: "Decimal | number | string",
        },
        issues,
      };
    case "BigInt":
      return {
        decision: {
          kind: "coerce-bigint",
          runtimeFn: "coerceBigInt",
          setterInputType: "bigint | number | string",
        },
        issues,
      };
    case "DateTime":
      return {
        decision: {
          kind: "coerce-date",
          runtimeFn: "coerceDate",
          setterInputType: "Date | string | number",
        },
        issues,
      };
    case "String":
    case "Boolean":
      return { decision: strictDecision(declaredType), issues };
    case "Json":
    case "Bytes":
      // Handled above by the early return for Json/Bytes — listed here only
      // so the exhaustiveness check below is meaningful.
      return { decision: strictDecision(declaredType), issues };
  }
}

function strictDecision(declaredType: string): CoerceDecision {
  return {
    kind: "strict",
    runtimeFn: null,
    setterInputType: declaredType,
  };
}

function decisionForExplicitCoerce(
  target: "date" | "int" | "float" | "decimal" | "string",
  declaredType: string,
): CoerceDecision {
  // The widened input type is the canonical set per target — the field's
  // declared type is almost always already a subset (e.g. String coerce(int)
  // declares `string`, widening is `number | string`, declared is already
  // in the union). We don't prepend declaredType here, so we don't end up
  // with `string | null | number | string` for nullable cross-type cases.
  // For Boolean fields we'd duplicate boolean; but @coerce on Boolean is
  // rejected upstream as an error so that case never reaches us.
  void declaredType;
  switch (target) {
    case "int":
      return {
        kind: "coerce-int",
        runtimeFn: "coerceInt",
        setterInputType: "number | string",
      };
    case "float":
      return {
        kind: "coerce-float",
        runtimeFn: "coerceFloat",
        setterInputType: "number | string",
      };
    case "decimal":
      return {
        kind: "coerce-decimal",
        runtimeFn: null,
        setterInputType: "Decimal | number | string",
      };
    case "date":
      return {
        kind: "coerce-date",
        runtimeFn: "coerceDate",
        setterInputType: "Date | string | number",
      };
    case "string":
      return {
        kind: "coerce-string",
        runtimeFn: null,
        setterInputType: "string | number | boolean | bigint",
      };
  }
}

function isDefaultCoerceScalar(scalar: ScalarType): boolean {
  return (
    scalar === "Int" ||
    scalar === "Float" ||
    scalar === "Decimal" ||
    scalar === "BigInt" ||
    scalar === "DateTime"
  );
}

function coerceTargetMatchesScalar(
  target: "date" | "int" | "float" | "decimal" | "string",
  scalar: ScalarType,
): boolean {
  return (
    (target === "int" && scalar === "Int") ||
    (target === "float" && scalar === "Float") ||
    (target === "decimal" && scalar === "Decimal") ||
    (target === "date" && scalar === "DateTime") ||
    (target === "string" && scalar === "String")
  );
}

function describeFieldType(type: FieldType): string {
  if (type.kind === "scalar") return type.scalar;
  if (type.kind === "enum") return "enum";
  if (type.kind === "relation") return "relation";
  return "unsupported";
}
