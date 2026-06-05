// Renders one Prisma model as a PHP 8.1+ class.
//
// Two declaration styles:
//   - "class"    → `final class User`           (PHP 8.1+)
//                  Public typed properties via constructor property promotion.
//                  Mutable; the caller can assign `$user->email = 'x';`.
//   - "readonly" → `final readonly class User`  (PHP 8.2+)
//                  Same shape, but every property is read-only after the
//                  constructor returns. Idiomatic for value objects and
//                  DTOs that should never mutate after hydration.
//
// Both styles use constructor property promotion — the canonical PHP 8
// shorthand that combines the parameter list with the property
// declarations:
//
//   public function __construct(
//       public string $id,
//       public ?string $name = null,
//       public int $points = 0,
//   ) {}
//
// What this DOESN'T do (intentional, v0 scope):
//   - No setters with @coerce / @normalise — those are property-hook
//     features that need PHP 8.4 and a Composer-published runtime. They'll
//     ship as `@polyprism/php-domain-class` in a later release.
//   - No `from(array): static` factory — until we have a v0 user with a
//     concrete need, the constructor is enough; users hydrate from arrays
//     with `new User(...$row)` or spread arguments at the call site.
//   - No `toArray()` / JSON serialisation helper — `json_encode($user)`
//     already produces the right shape for public-property classes; the
//     opaque-property cases live in php-domain-class anyway.

import type {
  FieldDef,
  ModelDef,
  PolyPrismConfig,
  PolyPrismIR,
} from "@polyprism/core";
import { resolveFieldIdent, resolveTypeIdent } from "@polyprism/core";

import type { Diagnostic } from "./diagnostics.js";
import { buildNativeTypeTag, renderPhpDoc } from "./phpdoc.js";
import { mapFieldPhpType } from "./type-mapper.js";
import { UseCollector } from "./use-collector.js";

export type PhpDeclarationStyle = "class" | "readonly";

export interface RenderPhpModelOptions {
  readonly model: ModelDef;
  readonly ir: PolyPrismIR;
  readonly config: PolyPrismConfig;
  readonly declarationStyle: PhpDeclarationStyle;
  /** Root namespace for model classes, e.g. `"Generated\\Models"`. */
  readonly modelsNamespace: string;
  /** Root namespace for enum classes, e.g. `"Generated\\Enums"`. */
  readonly enumsNamespace: string;
}

export interface RenderPhpModelResult {
  readonly source: string;
  readonly issues: readonly Diagnostic[];
}

export function renderPhpModel(opts: RenderPhpModelOptions): RenderPhpModelResult {
  const { model, ir, config, declarationStyle, modelsNamespace, enumsNamespace } = opts;
  const issues: Diagnostic[] = [];
  const collectDiagnostic = (d: Diagnostic): void => {
    issues.push(d);
  };

  // Pre-resolve PHP class identifiers + FQNs for all enums and models. The
  // type-mapper consults these maps; only the FQN form is registered with
  // the use collector if a cross-namespace reference is needed.
  const enumFqnLookup = new Map<string, string>(
    ir.enums.map((e) => [
      e.name,
      `${enumsNamespace}\\${resolveTypeIdent({
        schemaName: e.name,
        override: e.annotations.name,
        convention: config.naming.typeNaming,
      })}`,
    ]),
  );
  const modelFqnLookup = new Map<string, string>(
    ir.models.map((m) => [
      m.name,
      `${modelsNamespace}\\${resolveTypeIdent({
        schemaName: m.name,
        override: m.annotations.name,
        convention: config.naming.typeNaming,
      })}`,
    ]),
  );

  const selfIdent = resolveTypeIdent({
    schemaName: model.name,
    override: model.annotations.name,
    convention: config.naming.typeNaming,
  });
  const selfFqn = `${modelsNamespace}\\${selfIdent}`;

  const uses = new UseCollector(modelsNamespace);

  // Two-pass: build each field's promoted-property line, then assemble. We
  // need to know the full set of `use` statements before the file header
  // can be rendered, and the type mapper is what registers them.
  //
  // PHP 8.4 deprecates optional parameters declared before required ones
  // (the implicit-required-promotion warning). To stay idiomatic and
  // warning-free, we render required params first then optional ones,
  // preserving schema order WITHIN each group. Named-argument callers
  // are unaffected; positional-argument callers get a stable required-
  // first ordering.
  type LineEntry = { line: string; hasDefault: boolean };
  const entries: LineEntry[] = [];
  for (const field of model.fields) {
    if (field.annotations.hide) continue;

    const fieldIdent = resolveFieldIdent({
      schemaName: field.name,
      override: field.annotations.name,
      convention: config.naming.fieldNaming,
    });

    const mapping = mapFieldPhpType({
      field,
      modelSchemaName: model.name,
      uses,
      enumFqnLookup,
      modelFqnLookup,
      selfModelFqn: selfFqn,
      onDiagnostic: collectDiagnostic,
    });

    const defaultExpr = formatPhpDefault(field, enumFqnLookup, uses);

    const propertyDoc = renderPhpDoc(field.annotations, {
      indent: 8,
      extraTags: collectFieldExtraTags(field, mapping.listElementDoc),
    });

    // The `readonly` keyword could land either on every property OR on the
    // class. We pick class-level for the "readonly" style — single source
    // of truth, less line noise — so the per-property emit is identical
    // between the two styles.
    const propLine = defaultExpr === null
      ? `        public ${mapping.signatureType} $${fieldIdent}`
      : `        public ${mapping.signatureType} $${fieldIdent} = ${defaultExpr}`;
    entries.push({ line: `${propertyDoc}${propLine},`, hasDefault: defaultExpr !== null });
  }

  // Stable partition: required (no default) keeps schema order, then
  // optional (has default) keeps schema order. Array.prototype.filter
  // visits elements in index order, so each filtered subarray naturally
  // preserves the relative order of items in `entries`.
  const promotedLines = [
    ...entries.filter((e) => !e.hasDefault).map((e) => e.line),
    ...entries.filter((e) => e.hasDefault).map((e) => e.line),
  ];

  // Promoted properties go between the constructor parens. Even with no
  // visible fields PHP wants a balanced `()` — `final class { __construct() {} }`
  // is valid but useless.
  const promotedBlock =
    promotedLines.length > 0 ? `\n${promotedLines.join("\n")}\n    ` : "";

  const usesBlock = uses.render();
  const headerDoc = renderPhpDoc(model.annotations, { indent: 0 });

  const classKeywords = declarationStyle === "readonly" ? "final readonly class" : "final class";

  const source = [
    "<?php",
    "",
    "declare(strict_types=1);",
    "",
    `namespace ${modelsNamespace};`,
    "",
    usesBlock + `${headerDoc}${classKeywords} ${selfIdent}\n{\n    public function __construct(${promotedBlock}) {}\n}`,
    "",
  ].join("\n");

  return { source, issues };
}

function collectFieldExtraTags(field: FieldDef, listElementDoc: string | null): string[] {
  const tags: string[] = [];
  // List PHPDoc: `@var array<int, Type>` — PHPStan-shaped narrowing for arrays.
  if (listElementDoc !== null) {
    tags.push(`@var array<int, ${listElementDoc}>`);
  }
  const nativeTag = buildNativeTypeTag(field.nativeType);
  if (nativeTag) tags.push(nativeTag);
  return tags;
}

/**
 * Returns a PHP expression for the field's constructor default, or null if
 * the field requires a constructor argument (no representable default).
 *
 * Mirrors the ts-shared default-handling rules:
 *   - Lists default to `[]`.
 *   - Nullable scalars without a Prisma default get `null`.
 *   - Literal defaults emit only when the value's runtime type matches the
 *     field's scalar — guards against the "Int 90 on a DateTime field" footgun.
 *   - `now()` becomes `new \DateTimeImmutable()`.
 *   - Other function defaults (cuid/uuid/autoincrement) → null; the field
 *     becomes a required constructor argument.
 */
function formatPhpDefault(
  field: FieldDef,
  enumFqnLookup: ReadonlyMap<string, string>,
  uses: UseCollector,
): string | null {
  if (field.isList) return "[]";

  if (!field.isRequired && !field.hasDefaultValue) return "null";

  if (!field.hasDefaultValue || !field.default) return null;

  const d = field.default;

  if (d.kind === "literal") {
    return formatLiteralDefault(field, d.value, enumFqnLookup, uses);
  }

  if (d.kind === "list") return "[]";

  // d.kind === "function" — only `now()` has a PHP-representable value.
  if (d.name === "now") return "new \\DateTimeImmutable()";

  return null;
}

function formatLiteralDefault(
  field: FieldDef,
  value: string | number | boolean | null,
  enumFqnLookup: ReadonlyMap<string, string>,
  uses: UseCollector,
): string | null {
  if (value === null) return "null";

  if (typeof value === "string") {
    if (field.type.kind === "scalar" && field.type.scalar === "String") {
      return phpSingleQuoteString(value);
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
 * Render a PHP single-quoted string literal. Single quotes don't process
 * escapes other than `\\` and `\'`, so the encoder only needs to escape
 * those two characters.
 */
function phpSingleQuoteString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}
