// PHP-flavoured wrapper around `@polyprism/core`'s language-neutral
// `resolveCoerceKind`. The core helper inspects the IR and decides which
// setter shape applies (strict, coerce-int, coerce-date, etc); this file
// translates that into the PHP-specific output the renderer needs — the
// widened PHP type for the setter parameter (`int|string`,
// `\DateTimeImmutable|string|int`) and the matching `Polyprism\Runtime\Coerce`
// static method name.
//
// Only the php-domain-class renderer consumes this module. php-class and
// php-readonly continue to ignore `@coerce` / `@noCoerce` / `@normalise`.

import {
  type CoerceKind,
  type CoerceRulesIssue,
  type FieldDef,
  resolveCoerceKind,
} from "@polyprism/core";

// Backwards-compat aliases so existing imports of these names from
// `@polyprism/php-shared` continue to resolve.
export type PhpCoerceKind = CoerceKind;
export type PhpCoerceRulesIssue = CoerceRulesIssue;

export interface PhpCoerceDecision {
  readonly kind: PhpCoerceKind;
  /**
   * The static method on `Polyprism\Runtime\Coerce` to call, or `null` for
   * `strict` (no call) and `coerce-string` (inlined `(string) $value` cast).
   */
  readonly runtimeMethod: "int" | "float" | "bigint" | "date" | "decimal" | null;
  /**
   * Widened PHP input type for the setter parameter. For `strict` this
   * matches the declared field type; for coerce variants it widens to
   * accept the untrusted-boundary forms.
   *
   * Always non-nullable — nullability is layered on by the renderer (the
   * setter for a nullable field accepts `T|null`).
   */
  readonly setterInputType: string;
}

export interface PhpCoerceRulesResult {
  readonly decision: PhpCoerceDecision;
  readonly issues: readonly PhpCoerceRulesIssue[];
}

/**
 * Resolve the PHP setter strategy + any issues for a single field.
 *
 * @param field         The FieldDef from the IR
 * @param modelName     Schema-level model name (used in field paths for error messages)
 * @param declaredType  The PHP type the property's storage slot will declare
 *                      (output of the type-mapper, stripped of any nullable
 *                      `?` prefix). Used as the strict input type for the
 *                      `strict` kind.
 */
export function resolvePhpCoerceDecision(
  field: FieldDef,
  modelName: string,
  declaredType: string,
): PhpCoerceRulesResult {
  const { kind, issues } = resolveCoerceKind(field, modelName);
  return {
    decision: formatPhpDecision(kind, declaredType),
    issues,
  };
}

function formatPhpDecision(kind: PhpCoerceKind, declaredType: string): PhpCoerceDecision {
  switch (kind) {
    case "strict":
      return { kind, runtimeMethod: null, setterInputType: declaredType };
    case "coerce-int":
      return {
        kind,
        runtimeMethod: "int",
        setterInputType: "int|string",
      };
    case "coerce-float":
      return {
        kind,
        runtimeMethod: "float",
        setterInputType: "float|int|string",
      };
    case "coerce-bigint":
      return {
        kind,
        runtimeMethod: "bigint",
        setterInputType: "int|string",
      };
    case "coerce-date":
      return {
        kind,
        runtimeMethod: "date",
        setterInputType: "\\DateTimeImmutable|string|int",
      };
    case "coerce-decimal":
      return {
        kind,
        runtimeMethod: "decimal",
        setterInputType: "string|float|int",
      };
    case "coerce-string":
      return {
        kind,
        runtimeMethod: null,
        setterInputType: "string|int|float|bool",
      };
  }
}
