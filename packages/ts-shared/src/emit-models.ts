// Top-level emit pipeline shared across ts-interface, ts-type, ts-class,
// and ts-domain-class.
//
// Responsibilities:
//   1. Trigger core's shared enum + JSON-types emission.
//   2. Walk the IR for AnnotationSet.parseIssues — issues recorded by the
//      annotation parser when a /// directive is malformed. Until 0.1.7
//      these were stored on the IR and silently dropped.
//   3. Render each visible model via renderModel, collecting any emit-time
//      issues (currently only domain-class produces them via coerce-rules).
//   4. Report every collected issue through onDiagnostic (defaults to
//      stderr). If any are error-severity, throw at the end so the
//      generator surfaces a failure to Prisma.
//
// Output-on-error policy: rendering and file writes happen in one pass.
// If a model surfaces an error-severity diagnostic, models rendered
// before it have already been flushed to disk by the time the throw
// fires. That's a deliberate tradeoff over a render-everything-in-memory-
// first pass: the user gets visible feedback about which models DID
// render, and re-running `prisma generate` after the fix overwrites the
// partial output cleanly. The throw still aborts the Prisma generate run,
// so the user sees a non-zero generator status — they don't accidentally
// ship the partial output.
//
// Tests pass their own onDiagnostic to capture issues without leaking into
// the stderr buffer.

import type { AnnotationSet, EnumDef, GeneratorContext, ModelDef } from "@polyprism/core";
import { emitEnums, emitJsonTypes, resolveTypeFilename, resolveTypeIdent } from "@polyprism/core";

import { type Diagnostic, defaultReportDiagnostic } from "./diagnostics.js";
import { renderIndex } from "./render-index.js";
import { type DeclarationStyle, renderModel } from "./render-model.js";

export interface EmitModelsOptions {
  readonly declarationStyle: DeclarationStyle;
  /**
   * Optional diagnostic sink. Defaults to writing to stderr. Tests override
   * this to capture diagnostics for assertions.
   */
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
}

export async function emitModels(ctx: GeneratorContext, opts: EmitModelsOptions): Promise<void> {
  const report = opts.onDiagnostic ?? defaultReportDiagnostic;
  let errorCount = 0;
  const emit = (d: Diagnostic): void => {
    if (d.severity === "error") errorCount += 1;
    report(d);
  };

  // Shared output: enums + inline JSON types
  await emitEnums(ctx);
  await emitJsonTypes(ctx);

  // (1) Parser issues — recorded across models, fields, enums, and enum values.
  for (const diag of collectParseDiagnostics(ctx.ir)) emit(diag);

  // (2) Per-model render — one file per visible model, plus any emit-time issues.
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;

    const ident = resolveTypeIdent({
      schemaName: model.name,
      override: model.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const filename = resolveTypeFilename(ident, ctx.config.naming.fileNaming);

    const { source, issues } = renderModel({
      model,
      ir: ctx.ir,
      config: ctx.config,
      declarationStyle: opts.declarationStyle,
    });
    for (const issue of issues) emit(issue);

    await ctx.writer.write(`${filename}.ts`, source);
  }

  // Optional barrel
  if (ctx.config.emitIndex) {
    await ctx.writer.write(
      "index.ts",
      renderIndex(ctx, { declarationStyle: opts.declarationStyle }),
    );
  }

  if (errorCount > 0) {
    throw new Error(
      `PolyPrism: emit failed with ${errorCount} error-severity ` +
        `diagnostic${errorCount === 1 ? "" : "s"}. See the messages above for details.`,
    );
  }
}

/**
 * Walks the IR and yields one Diagnostic per AnnotationSet.parseIssue,
 * stamped with the model/field/enum/value context the parser couldn't see.
 */
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
