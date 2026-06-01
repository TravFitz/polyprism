// High-level emitter: walks the IR for inline `@json(...)` annotations
// (forms 3 + 4) and writes one file per generated JSON type.
//
// Bare and with-path `@json` forms reference an existing user type — no
// file emission for those. Inline forms (anonymous and named) generate
// a type alias file under `json-types/`.

import type { GeneratorContext } from "../generator/context.js";
import { autoNameInlineJson, resolveTypeFilename } from "../naming/resolver.js";
import { renderJsonType } from "./render-json-type.js";

export async function emitJsonTypes(ctx: GeneratorContext): Promise<void> {
  const collected = new Map<string, string>();

  for (const model of ctx.ir.models) {
    if (model.annotations.hide) continue;
    for (const field of model.fields) {
      if (field.annotations.hide) continue;
      const json = field.annotations.json;
      if (!json) continue;

      if (json.kind === "inline-anonymous") {
        const name = autoNameInlineJson(model.name, field.name);
        collected.set(name, json.typeExpression);
      } else if (json.kind === "inline-named") {
        collected.set(json.typeName, json.typeExpression);
      }
      // bare + with-path reference existing user types — no file to emit
    }
  }

  for (const [typeName, expr] of collected) {
    const filename = resolveTypeFilename(typeName, ctx.config.naming.fileNaming);
    const content = renderJsonType(typeName, expr);
    await ctx.writer.write(`json-types/${filename}.ts`, content);
  }
}
