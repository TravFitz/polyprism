// Maps an IR FieldDef to its PHP type expression.
//
// Resolution order (highest to lowest priority):
//   1. @type(...)   — explicit override, used verbatim. The user owns
//                     import-correctness; if the type lives in a different
//                     namespace, they should write a fully-qualified name.
//   2. @json(...)   — Json fields with @json annotations. PHP can't
//                     statically express the same flavour of structural
//                     types TS can, so for v0 we fall back to `mixed` and
//                     emit a warning rather than try to invent a PHP
//                     equivalent. (Future: emit readonly value classes for
//                     inline-named json shapes — that's its own feature.)
//   3. Default mapping from IR scalar/enum/relation kind.
//
// All paths funnel through wrapNullability() so list-ness and nullability
// land consistently.
//
// PHP-specific notes that drove the mapping:
//   - `bigint` becomes `int`. PHP `int` is platform-int — 64-bit on every
//     non-trivial deployment target since PHP 7, so values up to
//     `PHP_INT_MAX` (9.2e18) round-trip cleanly. Anyone needing bigger
//     numerics (cryptographic counters, scientific use) should set
//     `@type("string", ...)` per-field; the alternative of forcing a
//     bignum dep on every consumer doesn't earn its weight.
//   - `Decimal` becomes `string`. PHP has no native arbitrary-precision
//     decimal type; the universal lowest common denominator is "exact
//     string, parse with brick/math or BCMath at the consumer". Same
//     escape hatch (`@type`) applies if the consumer wants `BigDecimal`.
//   - `DateTime` becomes `\DateTimeImmutable`. Always immutable — mutable
//     `\DateTime` is a known-foot-bullet API in PHP.
//   - `Json` becomes `mixed`. No structural typing for JSON in PHP.
//   - `Bytes` becomes `string`. PHP convention for binary data.
//   - Lists are `array` in the signature; PHPDoc carries the element type.

import type { FieldDef, ScalarType } from "@polyprism/core";

import type { Diagnostic } from "./diagnostics.js";
import type { UseCollector } from "./use-collector.js";

export interface PhpTypeMapperOptions {
  readonly field: FieldDef;
  readonly modelSchemaName: string;
  readonly uses: UseCollector;
  readonly enumFqnLookup: ReadonlyMap<string, string>;
  readonly modelFqnLookup: ReadonlyMap<string, string>;
  /** FQN of the currently rendered model — relation fields back at this skip a `use`. */
  readonly selfModelFqn: string;
  /** Optional sink for warnings raised during mapping (unsupported @json, etc). */
  readonly onDiagnostic?: (d: Diagnostic) => void;
}

export interface PhpTypeMapping {
  /** The type as it appears in the constructor signature (e.g. `?string`, `array`, `\DateTimeImmutable`). */
  readonly signatureType: string;
  /** The element type for PHPDoc `@var array<int, X>` hints, or null when not a list. */
  readonly listElementDoc: string | null;
}

export function mapFieldPhpType(opts: PhpTypeMapperOptions): PhpTypeMapping {
  const baseType = mapBasePhpType(opts);
  return wrapNullability(baseType, opts.field);
}

function mapBasePhpType(opts: PhpTypeMapperOptions): string {
  const { field } = opts;

  // (1) @type override
  if (field.annotations.type) {
    // PHP's @type ignores the import-path side of the annotation — the user
    // is responsible for namespace correctness, same way the bare `@json(X)`
    // form works in the TS family. We DO strip a leading `?` from the
    // override so that combining `@type("?Foo")` with an optional-typed
    // field doesn't produce `??Foo` after wrapNullability prepends its own.
    // The user's leading `?` reads as intent ("this might be null"), and
    // wrapNullability will reapply it for optional fields anyway.
    const overrideType = field.annotations.type.typeName;
    return overrideType.startsWith("?") ? overrideType.slice(1).trimStart() : overrideType;
  }

  // (2) @json on Json field — unsupported in PHP for v0; warn and fall back.
  if (field.type.kind === "scalar" && field.type.scalar === "Json" && field.annotations.json) {
    opts.onDiagnostic?.({
      severity: "warning",
      context: `${opts.modelSchemaName}.${field.name}`,
      message:
        "PHP emitter does not yet resolve @json(...) annotations to typed shapes — " +
        "the field will be typed as `mixed`. Use @type(...) to set a specific PHP " +
        "class or array shape if you need stricter typing.",
    });
    return "mixed";
  }

  // (3) Default mapping
  switch (field.type.kind) {
    case "scalar":
      return mapScalar(field.type.scalar);
    case "enum":
      return resolveEnumShort(field.type.enumName, opts);
    case "relation":
      return resolveRelationShort(field.type.modelName, opts);
    case "unsupported":
      return "mixed";
  }
}

function mapScalar(scalar: ScalarType): string {
  switch (scalar) {
    case "String":
      return "string";
    case "Boolean":
      return "bool";
    case "Int":
      return "int";
    case "Float":
      return "float";
    case "BigInt":
      // See header comment — PHP int is 64-bit on all modern targets;
      // @type(string) is the escape hatch for the rare overflow case.
      return "int";
    case "Decimal":
      return "string";
    case "DateTime":
      // Leading backslash signals "global namespace" so this works whether
      // or not the current file `use \DateTimeImmutable;`. We don't bother
      // registering a use for the built-in.
      return "\\DateTimeImmutable";
    case "Json":
      return "mixed";
    case "Bytes":
      return "string";
  }
}

function resolveEnumShort(enumName: string, opts: PhpTypeMapperOptions): string {
  const fqn = opts.enumFqnLookup.get(enumName);
  if (!fqn) return enumName; // best-effort fallback; the renderer's caller is supposed to populate the lookup
  return opts.uses.add(fqn);
}

function resolveRelationShort(modelName: string, opts: PhpTypeMapperOptions): string {
  const fqn = opts.modelFqnLookup.get(modelName);
  if (!fqn) return modelName;
  // Skip use registration for self-references — the type resolves inside
  // the current namespace without a use statement.
  if (fqn === opts.selfModelFqn) {
    return shortNameOf(fqn);
  }
  return opts.uses.add(fqn);
}

function shortNameOf(fqn: string): string {
  const i = fqn.lastIndexOf("\\");
  return i === -1 ? fqn : fqn.slice(i + 1);
}

function wrapNullability(baseType: string, field: FieldDef): PhpTypeMapping {
  if (field.isList) {
    // Lists are typed as `array` in the constructor — PHP's signature
    // doesn't carry an element type — and the element shape is recorded
    // separately for PHPDoc emission. Lists themselves are non-nullable:
    // Prisma returns `[]` for an empty list, never `null`.
    return { signatureType: "array", listElementDoc: baseType };
  }
  if (!field.isRequired) {
    // PHP nullable shorthand. Won't compose for built-ins prefixed with `\`
    // since `?\DateTimeImmutable` is the standard idiomatic form (and PHP
    // parses it correctly), but worth noting in case a future override
    // changes how `\` prefixes are emitted.
    //
    // `mixed` already includes null in PHP's type system — `?mixed` is a
    // syntax error. The only path that produces `mixed` today is the Json
    // scalar mapping, but we keep the check by base-type rather than by
    // field shape so a future @type override that resolves to `mixed`
    // doesn't trip the same footgun.
    if (baseType === "mixed") {
      return { signatureType: baseType, listElementDoc: null };
    }
    return { signatureType: `?${baseType}`, listElementDoc: null };
  }
  return { signatureType: baseType, listElementDoc: null };
}
