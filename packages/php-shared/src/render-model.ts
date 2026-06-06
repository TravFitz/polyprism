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

import type { ModelDef, PolyPrismConfig, PolyPrismIR } from "@polyprism/core";
import {
  buildEnumIdentLookup,
  buildModelIdentLookup,
  resolveFieldIdent,
  resolveTypeIdent,
} from "@polyprism/core";

import { formatPhpDefault } from "./defaults.js";
import type { Diagnostic } from "./diagnostics.js";
import { collectFieldExtraTags, renderPhpDoc } from "./phpdoc.js";
import { renderPhpDomainClass } from "./render-domain-class.js";
import { mapFieldPhpType } from "./type-mapper.js";
import { UseCollector } from "./use-collector.js";

export type PhpDeclarationStyle = "class" | "readonly" | "domain-class";

export interface RenderPhpModelOptions {
  readonly model: ModelDef;
  readonly ir: PolyPrismIR;
  readonly config: PolyPrismConfig;
  readonly declarationStyle: PhpDeclarationStyle;
  /** Root namespace for model classes, e.g. `"Generated\\Models"`. */
  readonly modelsNamespace: string;
  /** Root namespace for enum classes, e.g. `"Generated\\Enums"`. */
  readonly enumsNamespace: string;
  /** Root namespace for generated JSON value classes, e.g. `"Generated\\JsonTypes"`. */
  readonly jsonTypesNamespace: string;
  /** Names of JSON value classes that were successfully generated this run. */
  readonly jsonTypeClassNames: ReadonlySet<string>;
}

export interface RenderPhpModelResult {
  readonly source: string;
  readonly issues: readonly Diagnostic[];
}

export function renderPhpModel(opts: RenderPhpModelOptions): RenderPhpModelResult {
  const {
    model,
    ir,
    config,
    declarationStyle,
    modelsNamespace,
    enumsNamespace,
    jsonTypesNamespace,
    jsonTypeClassNames,
  } = opts;

  // The "domain-class" style is a fundamentally different shape (property
  // hooks, no constructor property promotion, runtime helpers) — delegate
  // to its dedicated renderer rather than branching deeply through the
  // promoted-property path below.
  if (declarationStyle === "domain-class") {
    return renderPhpDomainClass({
      model,
      ir,
      config,
      modelsNamespace,
      enumsNamespace,
      jsonTypesNamespace,
      jsonTypeClassNames,
    });
  }

  const issues: Diagnostic[] = [];
  const collectDiagnostic = (d: Diagnostic): void => {
    issues.push(d);
  };

  // Pre-resolve PHP class identifiers + FQNs for all enums and models. The
  // type-mapper consults these maps; only the FQN form is registered with
  // the use collector if a cross-namespace reference is needed.
  const enumFqnLookup = buildEnumIdentLookup(ir, config, enumsNamespace);
  const modelFqnLookup = buildModelIdentLookup(ir, config, modelsNamespace);

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
      jsonTypesNamespace,
      jsonTypeClassNames,
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
    const propLine =
      defaultExpr === null
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
  const promotedBlock = promotedLines.length > 0 ? `\n${promotedLines.join("\n")}\n    ` : "";

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
    usesBlock +
      `${headerDoc}${classKeywords} ${selfIdent}\n{\n    public function __construct(${promotedBlock}) {}\n}`,
    "",
  ].join("\n");

  return { source, issues };
}
