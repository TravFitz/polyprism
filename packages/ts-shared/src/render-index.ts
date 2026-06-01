// Optional barrel file that re-exports every emitted model, enum, and JSON type.
// Off by default — opt-in via `emitIndex = true` in the generator block.
//
// Model re-export form depends on declarationStyle:
//   - "interface" / "type" → `export type { User }` (type-only)
//   - "class"              → `export { User }`      (class is a runtime value)
//
// Enums are always runtime values; JSON types are always type-only.

import type { GeneratorContext } from "@omniprism/core";
import { autoNameInlineJson, resolveTypeFilename, resolveTypeIdent } from "@omniprism/core";

import type { DeclarationStyle } from "./render-model.js";

export interface RenderIndexOptions {
  readonly declarationStyle: DeclarationStyle;
}

export function renderIndex(ctx: GeneratorContext, opts: RenderIndexOptions): string {
  const lines: string[] = [];
  const modelExportKeyword = opts.declarationStyle === "class" ? "export" : "export type";

  // Models
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;
    const ident = resolveTypeIdent({
      schemaName: model.name,
      override: model.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const filename = resolveTypeFilename(ident, ctx.config.naming.fileNaming);
    lines.push(`${modelExportKeyword} { ${ident} } from "./${filename}.js";`);
  }

  // Enums — always runtime values
  for (const enumDef of ctx.ir.enums) {
    if (enumDef.annotations.hide) continue;
    const ident = resolveTypeIdent({
      schemaName: enumDef.name,
      override: enumDef.annotations.name,
      convention: ctx.config.naming.typeNaming,
    });
    const filename = resolveTypeFilename(ident, ctx.config.naming.fileNaming);
    lines.push(`export { ${ident} } from "./enums/${filename}.js";`);
  }

  // JSON types — always type-only
  const seen = new Set<string>();
  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;
    for (const field of model.fields) {
      if (field.annotations.hide) continue;
      const json = field.annotations.json;
      if (!json) continue;
      let typeName: string | null = null;
      if (json.kind === "inline-anonymous") {
        typeName = autoNameInlineJson(model.name, field.name);
      } else if (json.kind === "inline-named") {
        typeName = json.typeName;
      }
      if (!typeName || seen.has(typeName)) continue;
      seen.add(typeName);
      const filename = resolveTypeFilename(typeName, ctx.config.naming.fileNaming);
      lines.push(`export type { ${typeName} } from "./json-types/${filename}.js";`);
    }
  }

  return `${lines.join("\n")}\n`;
}
