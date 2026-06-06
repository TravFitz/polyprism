// PHP default-expression formatting, shared between `render-model.ts`
// (php-class / php-readonly) and `render-domain-class.ts`.
//
// Pre-hoist this lived as byte-identical copies in both renderers — the
// emit decision tree for "what is this field's default expression, or
// null if it has none" is the same regardless of declaration style.
// Only the SHAPE in which the default lands changes (php-class puts it
// on the promoted constructor param; php-domain-class puts it on the
// property declaration AND the constructor param, splitting where it's
// safe to emit non-compile-time expressions).
//
// The TS family has its own, language-specific equivalents in
// `@polyprism/ts-shared` — they diverge enough at the leaves (JSON-
// quoted strings, `new Decimal(n)` / `BigInt(n)` wrappers, no
// distinction between `now()` and other function defaults) that
// hoisting the classifier any further isn't worth the abstraction tax.

import type { FieldDef } from "@polyprism/core";

import { phpSingleQuote } from "./literals.js";
import type { UseCollector } from "./use-collector.js";

/**
 * Returns a PHP expression for the field's constructor default, or null if
 * the field requires a constructor argument (no representable default).
 *
 * Mirrors the ts-shared default-handling rules:
 *   - Lists default to `[]`.
 *   - Nullable scalars without a Prisma default get `null`.
 *   - Literal defaults emit only when the value's runtime type matches the
 *     field's scalar — guards against the "Int 90 on a DateTime field"
 *     footgun.
 *   - `now()` becomes `new \DateTimeImmutable()`.
 *   - Other function defaults (cuid/uuid/autoincrement) → null; the field
 *     becomes a required constructor argument.
 *
 * `enumFqnLookup` + `uses` are taken as parameters so this helper doesn't
 * have to know about renderer-internal state. The use collector is
 * mutated (any enum default registers a `use` for the enum's FQN).
 */
export function formatPhpDefault(
  field: FieldDef,
  enumFqnLookup: ReadonlyMap<string, string>,
  uses: UseCollector,
): string | null {
  if (field.isList) return "[]";

  if (!field.isRequired && !field.hasDefaultValue) return "null";

  if (!field.hasDefaultValue || !field.default) return null;

  const d = field.default;

  if (d.kind === "literal") {
    return formatPhpLiteralDefault(field, d.value, enumFqnLookup, uses);
  }

  if (d.kind === "list") return "[]";

  // d.kind === "function" — only `now()` has a PHP-representable value.
  if (d.name === "now") return "new \\DateTimeImmutable()";

  return null;
}

function formatPhpLiteralDefault(
  field: FieldDef,
  value: string | number | boolean | null,
  enumFqnLookup: ReadonlyMap<string, string>,
  uses: UseCollector,
): string | null {
  if (value === null) return "null";

  if (typeof value === "string") {
    if (field.type.kind === "scalar" && field.type.scalar === "String") {
      return phpSingleQuote(value);
    }
    if (field.type.kind === "enum") {
      const enumFqn = enumFqnLookup.get(field.type.enumName);
      if (!enumFqn) return null;
      const shortName = uses.add(enumFqn);
      return `${shortName}::${value}`;
    }
    // String literal on a non-String/non-enum scalar is the "Int 90 →
    // DateTime" class of footgun. Refuse to fabricate a value.
    return null;
  }

  if (typeof value === "number") {
    if (field.type.kind === "scalar" && field.type.scalar === "Int") {
      return String(value);
    }
    if (field.type.kind === "scalar" && field.type.scalar === "Float") {
      // Preserve the "this is a float literal" intent that the schema
      // author expressed. Prisma's DMMF coerces `@default(1.0)` to the JS
      // number `1`, so `String(1)` would emit `1` and lose the decimal
      // point. PHP accepts `int` → `float` widening at the type level,
      // but `1.0` reads more honestly in the generated source for a
      // float-typed property.
      return Number.isInteger(value) ? `${value}.0` : String(value);
    }
    // Numeric defaults on BigInt / Decimal / DateTime need wrapping that
    // doesn't fit neatly inline in a PHP constructor param default. Skip;
    // the field becomes a required constructor arg.
    return null;
  }

  if (typeof value === "boolean") {
    if (field.type.kind === "scalar" && field.type.scalar === "Boolean") {
      return value ? "true" : "false";
    }
    return null;
  }

  return null;
}

/**
 * Whether a default expression is a compile-time constant (and therefore
 * legal in a PHP property-declaration default).
 *
 * PHP allows runtime expressions like `new Foo()` ONLY in constructor
 * parameter defaults, class constants, and static properties. Regular
 * (non-static) property declarations require compile-time constants
 * (scalars, enum cases, null, arrays of constants, simple arithmetic).
 *
 * For PolyPrism's renderer, the one non-constant expression we emit is
 * `new \DateTimeImmutable()` (the materialisation of `@default(now())`).
 * That has to live on the constructor param only — the property
 * declaration goes without an initializer in that case, and the
 * constructor body's unconditional `$this->prop = $arg;` populates it.
 *
 * The check is intentionally simple: any expression starting with `new `
 * is runtime, everything else is constant. We don't currently emit other
 * runtime shapes (no method calls, no arithmetic across function results),
 * so this is sufficient.
 */
export function isCompileTimeConstantPhpExpr(expr: string): boolean {
  return !expr.startsWith("new ");
}
