// Top-level emit pipeline for the PHP family (php-class, php-readonly).
//
// Layout produced on disk (relative to the generator's outputDir):
//
//   <outputDir>/
//     Models/
//       User.php
//       Order.php
//     Enums/
//       Role.php
//
// Each file declares its PSR-4 namespace as the first non-php-tag line,
// so users can wire the generated directory into composer.json autoload
// with a single mapping:
//
//   "autoload": {
//     "psr-4": {
//       "Generated\\": "src/Generated/"
//     }
//   }
//
// Annotations honoured (v0):
//   - @hide          — field is omitted from the class body
//   - @deprecated    — emits a PHPDoc @deprecated tag
//   - @name          — overrides the class / field identifier verbatim
//   - @type          — overrides the field's PHP type expression verbatim
//   - @json(...)     — inline forms (anonymous + named) generate readonly
//     value classes under JsonTypes/; the Json field's type resolves to the
//     generated class name. Bare and with-path forms emit a warning and
//     fall back to `mixed` (PHP has no equivalent of TS module imports).
//
// Annotations recognised but ignored (intentional v0 scope):
//   - @coerce / @normalise / @noCoerce — domain-class concepts that need
//     PHP 8.4 property hooks + a runtime helper. Will land as php-domain-class.
//
// Errors propagate the same way the ts-shared pipeline does: per-issue
// onDiagnostic callback (defaults to stderr), accumulate error-severity
// count, throw at the end if non-zero.

import type { AnnotationSet, EnumDef, GeneratorContext, ModelDef } from "@polyprism/core";
import { autoNameInlineJson, resolveTypeIdent } from "@polyprism/core";

import { type Diagnostic, defaultReportDiagnostic } from "./diagnostics.js";
import { renderPhpEnum } from "./render-enum.js";
import { renderPhpJsonType } from "./render-json-type.js";
import { type PhpDeclarationStyle, renderPhpModel } from "./render-model.js";

export interface EmitPhpModelsOptions {
  readonly declarationStyle: PhpDeclarationStyle;
  /**
   * Root namespace for model classes. Default: `"Generated\\Models"`.
   * Use a single backslash in source; this is a real PHP namespace string
   * (no escape doubling required at runtime — the doubling shown here is
   * just because backslash is the JS escape character).
   */
  readonly modelsNamespace?: string;
  /** Root namespace for enum classes. Default: `"Generated\\Enums"`. */
  readonly enumsNamespace?: string;
  /** Root namespace for generated JSON value classes. Default: `"Generated\\JsonTypes"`. */
  readonly jsonTypesNamespace?: string;
  /** Optional diagnostic sink. Defaults to stderr. */
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
}

const DEFAULT_MODELS_NAMESPACE = "Generated\\Models";
const DEFAULT_ENUMS_NAMESPACE = "Generated\\Enums";
const DEFAULT_JSON_TYPES_NAMESPACE = "Generated\\JsonTypes";

export async function emitPhpModels(
  ctx: GeneratorContext,
  opts: EmitPhpModelsOptions,
): Promise<void> {
  const report = opts.onDiagnostic ?? defaultReportDiagnostic;
  const modelsNamespace = opts.modelsNamespace ?? DEFAULT_MODELS_NAMESPACE;
  const enumsNamespace = opts.enumsNamespace ?? DEFAULT_ENUMS_NAMESPACE;
  const jsonTypesNamespace = opts.jsonTypesNamespace ?? DEFAULT_JSON_TYPES_NAMESPACE;
  let errorCount = 0;

  const emit = (d: Diagnostic): void => {
    if (d.severity === "error") errorCount += 1;
    report(d);
  };

  // (1) Parser issues — recorded across models, fields, enums, enum values.
  for (const diag of collectParseDiagnostics(ctx.ir)) emit(diag);

  // (2) Enums — one file per visible enum, under <outputDir>/Enums/<Name>.php
  for (const enumDef of ctx.ir.enums) {
    if (enumDef.annotations.hide) continue;
    const filename = resolveTypeIdent({
      schemaName: enumDef.name,
      override: enumDef.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const source = renderPhpEnum({
      enumDef,
      naming: ctx.config.naming,
      namespace: enumsNamespace,
    });
    await ctx.writer.write(`Enums/${filename}.php`, source);
  }

  // (3) JSON value classes — one file per inline @json shape (forms 3 + 4),
  //     under <outputDir>/JsonTypes/<Name>.php. Bare and with-path forms
  //     reference user-supplied types and are warned about in the type
  //     mapper rather than generating files here.
  const jsonTypesEmitted = new Map<string, string>();
  // Track which field first registered each JsonType name so collision
  // warnings can point at both sides.
  const jsonTypeOrigin = new Map<string, string>();
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;
    for (const field of model.fields) {
      if (field.annotations.hide) continue;
      const json = field.annotations.json;
      if (!json) continue;
      let typeName: string | null = null;
      let typeExpression: string | null = null;
      if (json.kind === "inline-anonymous") {
        typeName = autoNameInlineJson(model.name, field.name);
        typeExpression = json.typeExpression;
      } else if (json.kind === "inline-named") {
        typeName = json.typeName;
        typeExpression = json.typeExpression;
      }
      if (!typeName || typeExpression === null) continue;

      const origin = `${model.name}.${field.name}`;
      const existing = jsonTypesEmitted.get(typeName);
      if (existing !== undefined && existing !== typeExpression) {
        // Two different inline @json shapes resolved to the same class
        // name. Common ways this happens: two inline-anonymous fields
        // whose Model+Field PascalCase to the same identifier, or two
        // inline-named declarations sharing a name with different shapes.
        // Last-write-wins matches the core TS pipeline behaviour, but
        // PHP's nominal typing makes a silent shape mismatch nastier
        // than TS's structural one (the class is what it is at runtime,
        // not what the consumer expected). Warn loudly so the user can
        // disambiguate with @json(<UniqueName> = { ... }).
        emit({
          severity: "warning",
          context: origin,
          message:
            `@json auto-naming collision: ${origin} produced JsonType class ` +
            `"${typeName}" but a different shape from ${jsonTypeOrigin.get(typeName)} ` +
            "already registered the same name. The later shape wins; the earlier " +
            "field's runtime class will not match its schema-declared shape. " +
            "Disambiguate with `@json(<UniqueName> = { ... })`.",
        });
      }
      jsonTypesEmitted.set(typeName, typeExpression);
      if (!jsonTypeOrigin.has(typeName)) jsonTypeOrigin.set(typeName, origin);
    }
  }
  // Drive the type-mapper off the SUCCESSFUL set (built below), not the
  // intent set above. Otherwise an unparseable expression would still
  // register a `use` for a class that was never written.
  const successfullyEmitted = new Set<string>();
  for (const [typeName, expression] of jsonTypesEmitted) {
    const { source, issues } = renderPhpJsonType({
      typeName,
      typeExpression: expression,
      namespace: jsonTypesNamespace,
      // Best-effort context: there's no single source field for a named
      // shape that's referenced from multiple places, so the JSON type
      // class itself is the locus.
      diagnosticContext: `JsonTypes.${typeName}`,
    });
    for (const issue of issues) emit(issue);
    if (source.length === 0) {
      // Renderer rejected the expression as unparseable. The warning has
      // already been emitted; the field will fall back to `mixed` when
      // the type-mapper checks `successfullyEmitted`.
      continue;
    }
    await ctx.writer.write(`JsonTypes/${typeName}.php`, source);
    successfullyEmitted.add(typeName);
  }

  // (4) Models — one file per visible model, under <outputDir>/Models/<Name>.php
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;
    const filename = resolveTypeIdent({
      schemaName: model.name,
      override: model.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const { source, issues } = renderPhpModel({
      model,
      ir: ctx.ir,
      config: ctx.config,
      declarationStyle: opts.declarationStyle,
      modelsNamespace,
      enumsNamespace,
      jsonTypesNamespace,
      jsonTypeClassNames: successfullyEmitted,
    });
    for (const issue of issues) emit(issue);
    await ctx.writer.write(`Models/${filename}.php`, source);
  }

  if (errorCount > 0) {
    throw new Error(
      `PolyPrism: PHP emit failed with ${errorCount} error-severity ` +
        `diagnostic${errorCount === 1 ? "" : "s"}. See the messages above for details.`,
    );
  }
}

function* collectParseDiagnostics(ir: {
  readonly models: readonly ModelDef[];
  readonly enums: readonly EnumDef[];
}): Generator<Diagnostic> {
  for (const model of ir.models) {
    yield* parseIssuesFor(model.annotations, model.name);
    for (const field of model.fields) {
      yield* parseIssuesFor(field.annotations, `${model.name}.${field.name}`);
    }
  }
  for (const enumDef of ir.enums) {
    yield* parseIssuesFor(enumDef.annotations, enumDef.name);
    for (const value of enumDef.values) {
      yield* parseIssuesFor(value.annotations, `${enumDef.name}.${value.name}`);
    }
  }
}

function* parseIssuesFor(annotations: AnnotationSet, context: string): Generator<Diagnostic> {
  for (const issue of annotations.parseIssues) {
    yield { severity: issue.severity, context, message: issue.message };
  }
}
