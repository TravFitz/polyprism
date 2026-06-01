// High-level emitter: walks the IR's enums and writes one file per enum.
// Each pattern's emitter calls `await emitEnums(ctx)` for free standalone
// enum emission. The directory is fixed at `enums/` for consistency.

import type { GeneratorContext } from "../generator/context.js";
import { resolveTypeFilename, resolveTypeIdent } from "../naming/resolver.js";
import { renderEnum } from "./render-enum.js";

export async function emitEnums(ctx: GeneratorContext): Promise<void> {
  for (const enumDef of ctx.ir.enums) {
    if (enumDef.annotations.hide) continue;

    const ident = resolveTypeIdent({
      schemaName: enumDef.name,
      override: enumDef.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const filename = resolveTypeFilename(ident, ctx.config.naming.fileNaming);

    const content = renderEnum(enumDef, ctx.config.naming);
    await ctx.writer.write(`enums/${filename}.ts`, content);
  }
}
