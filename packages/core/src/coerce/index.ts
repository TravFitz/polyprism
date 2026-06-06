// Language-neutral decision matrix for setter coercion in domain-class
// emitters (TypeScript, PHP, and any future families).
//
// Hoisted here in v0.2.1 from `@polyprism/ts-shared`'s and
// `@polyprism/php-shared`'s previously-duplicated `coerce-rules.ts`. The
// decision logic — which scalars coerce by default, what `@noCoerce` does,
// when `@coerce(target)` is redundant, which combinations are errors — is
// truly language-neutral: it only inspects the IR's `FieldDef`. Each
// language layer wraps `resolveCoerceKind` with its own thin formatter
// that turns the resulting `CoerceKind` into the output strings it needs
// (TS `setterInputType: "number | string"`, PHP `setterInputType:
// "int|string"`, runtime function names per family, etc).
//
// The default behaviour is "coerce by default on the scalars that
// commonly arrive as stringified primitives from untrusted boundaries
// (`Int` / `Float` / `Decimal` / `BigInt` / `DateTime`), strict by
// default elsewhere". Two annotations override:
//   - `@noCoerce` flips a default-coerce field to strict
//   - `@coerce(target)` opts a strict-by-default field in to cross-type
//     coercion (e.g. `String @coerce(int)` for legacy stringified columns)

import type { FieldDef, FieldType, ScalarType } from "../ir/types.js";

/**
 * Canonical kind of setter for a field. Determines which runtime helper
 * (if any) the generated setter calls into and which input shapes the
 * setter accepts. The kind is language-neutral; per-language metadata
 * (PHP/TS type strings, runtime function names) is layered on top by
 * the language-shared packages.
 */
export type CoerceKind =
  | "strict"
  | "coerce-int"
  | "coerce-float"
  | "coerce-bigint"
  | "coerce-date"
  | "coerce-decimal"
  | "coerce-string";

export interface CoerceRulesIssue {
  readonly severity: "error" | "warning";
  /** `"Model.field"` path so the issue can be reported with location context. */
  readonly fieldPath: string;
  readonly message: string;
}

export interface CoerceKindResult {
  readonly kind: CoerceKind;
  readonly issues: readonly CoerceRulesIssue[];
}

/**
 * Resolve the setter coercion kind for a single field, plus any emit-time
 * diagnostics (annotation contradictions, redundant `@coerce` targets,
 * `@coerce` on Boolean, etc).
 *
 * Returns only the kind + issues. Per-language layers (`ts-shared`,
 * `php-shared`) wrap this with their own decision objects that include
 * the language-specific setter input type and runtime symbol.
 *
 * @param field      The FieldDef from the IR
 * @param modelName  Schema-level model name (used to build the `fieldPath`
 *                   on every issue raised)
 */
export function resolveCoerceKind(field: FieldDef, modelName: string): CoerceKindResult {
  const fieldPath = `${modelName}.${field.name}`;
  const issues: CoerceRulesIssue[] = [];

  const { coerce, noCoerce, normalise } = field.annotations;

  // Lists short-circuit to strict — per-element coercion is out of v0.2
  // scope. The annotation is preserved on the field but ignored on
  // list-typed fields. We warn ONCE here so noisy schemas don't drown
  // the user in repeat warnings.
  if (field.isList) {
    if (coerce !== null || noCoerce || (normalise && normalise.length > 0)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message:
          "@coerce / @noCoerce / @normalise are ignored on list fields in v0.2 (per-element coercion is not supported).",
      });
    }
    return { kind: "strict", issues };
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
    return { kind: "strict", issues };
  }

  // Enum → strict. No sane string→enum coercion ("admin" vs "ADMIN" varies
  // per team).
  if (field.type.kind === "enum") {
    if (coerce !== null || (normalise && normalise.length > 0)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message:
          "@coerce / @normalise have no effect on enum fields. Use @name() to rename the enum or pre-coerce at the boundary.",
      });
    }
    return { kind: "strict", issues };
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
      return { kind: "strict", issues };
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
    return { kind: kindForExplicitCoerce(coerce), issues };
  }

  // @noCoerce on a strict-by-default scalar → warning, but emit strict.
  if (noCoerce) {
    if (!isDefaultCoerceScalar(scalar)) {
      issues.push({
        severity: "warning",
        fieldPath,
        message: `@noCoerce has no effect on ${scalar} fields (they are strict by default already).`,
      });
    }
    return { kind: "strict", issues };
  }

  // No explicit annotations — apply type-based default.
  switch (scalar) {
    case "Int":
      return { kind: "coerce-int", issues };
    case "Float":
      return { kind: "coerce-float", issues };
    case "Decimal":
      return { kind: "coerce-decimal", issues };
    case "BigInt":
      return { kind: "coerce-bigint", issues };
    case "DateTime":
      return { kind: "coerce-date", issues };
    case "String":
    case "Boolean":
      return { kind: "strict", issues };
    case "Json":
    case "Bytes":
      // Handled above by the early return for Json/Bytes — listed here
      // only so the exhaustiveness check above is meaningful.
      return { kind: "strict", issues };
  }
}

function kindForExplicitCoerce(
  target: "date" | "int" | "float" | "decimal" | "string",
): CoerceKind {
  switch (target) {
    case "int":
      return "coerce-int";
    case "float":
      return "coerce-float";
    case "decimal":
      return "coerce-decimal";
    case "date":
      return "coerce-date";
    case "string":
      return "coerce-string";
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
