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
//
// Annotations recognised but ignored (intentional v0 scope):
//   - @coerce / @normalise / @noCoerce — domain-class concepts that need
//     PHP 8.4 property hooks + a runtime helper. Will land as php-domain-class.
//   - @json(...) typed shapes — falls back to `mixed` and emits a warning.
//     Future: emit readonly value classes for inline-named shapes.
//
// Errors propagate the same way the ts-shared pipeline does: per-issue
// onDiagnostic callback (defaults to stderr), accumulate error-severity
// count, throw at the end if non-zero.

import type { AnnotationSet, EnumDef, GeneratorContext, ModelDef } from "@polyprism/core";
import { resolveTypeIdent } from "@polyprism/core";

import { type Diagnostic, defaultReportDiagnostic } from "./diagnostics.js";
import { renderPhpEnum } from "./render-enum.js";
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
  /** Optional diagnostic sink. Defaults to stderr. */
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
}

const DEFAULT_MODELS_NAMESPACE = "Generated\\Models";
const DEFAULT_ENUMS_NAMESPACE = "Generated\\Enums";

export async function emitPhpModels(
  ctx: GeneratorContext,
  opts: EmitPhpModelsOptions,
): Promise<void> {
  const report = opts.onDiagnostic ?? defaultReportDiagnostic;
  const modelsNamespace = opts.modelsNamespace ?? DEFAULT_MODELS_NAMESPACE;
  const enumsNamespace = opts.enumsNamespace ?? DEFAULT_ENUMS_NAMESPACE;
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

  // (3) Models — one file per visible model, under <outputDir>/Models/<Name>.php
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
