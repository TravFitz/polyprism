// Top-level emit pipeline shared across ts-interface, ts-type, and ts-class.
//
// Walks the IR's models, renders each via renderModel (parameterised by
// declaration style), writes one file per visible model, and triggers
// core's shared enum + JSON-types emission.

import type { GeneratorContext } from "@polyprism/core";
import { emitEnums, emitJsonTypes, resolveTypeFilename, resolveTypeIdent } from "@polyprism/core";

import { renderIndex } from "./render-index.js";
import { type DeclarationStyle, renderModel } from "./render-model.js";

export interface EmitModelsOptions {
  readonly declarationStyle: DeclarationStyle;
}

export async function emitModels(ctx: GeneratorContext, opts: EmitModelsOptions): Promise<void> {
  // Shared output: enums + inline JSON types
  await emitEnums(ctx);
  await emitJsonTypes(ctx);

  // One file per visible model
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;

    const ident = resolveTypeIdent({
      schemaName: model.name,
      override: model.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const filename = resolveTypeFilename(ident, ctx.config.naming.fileNaming);

    const content = renderModel({
      model,
      ir: ctx.ir,
      config: ctx.config,
      declarationStyle: opts.declarationStyle,
    });

    await ctx.writer.write(`${filename}.ts`, content);
  }

  // Optional barrel
  if (ctx.config.emitIndex) {
    await ctx.writer.write(
      "index.ts",
      renderIndex(ctx, { declarationStyle: opts.declarationStyle }),
    );
  }
}
