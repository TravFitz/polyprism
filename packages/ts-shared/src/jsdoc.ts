// JSDoc rendering for models, fields, and enums.
//
// Combines free-form documentation text with structured annotations
// (@deprecated specifically) and any caller-supplied `extraTags` (e.g. the
// `@db.Decimal(19, 2)` precision note we attach to fields with a Prisma
// native type) into a single /** ... */ block.

import type { AnnotationSet } from "@polyprism/core";

export interface JsDocOptions {
  /** Number of leading spaces on each emitted line (0 for model-level, 2 for field-level). */
  indent: number;
  /**
   * Optional extra JSDoc tag lines (without the leading ` * `). Rendered after
   * the documentation block and after `@deprecated`. Used by render-model to
   * surface things like `@db.Decimal(19, 2)` from a field's nativeType — the
   * plan calls this out as "noted in JSDoc but doesn't affect TS type".
   */
  extraTags?: readonly string[];
}

export function renderJsDoc(annotations: AnnotationSet, opts: JsDocOptions): string {
  const lines: string[] = [];
  const pad = " ".repeat(opts.indent);

  if (annotations.documentation) {
    for (const docLine of annotations.documentation.split("\n")) {
      lines.push(`${pad} * ${docLine}`);
    }
  }
  if (annotations.deprecated) {
    const reason = annotations.deprecated.reason;
    lines.push(reason ? `${pad} * @deprecated ${reason}` : `${pad} * @deprecated`);
  }
  if (opts.extraTags) {
    for (const tag of opts.extraTags) {
      lines.push(`${pad} * ${tag}`);
    }
  }

  if (lines.length === 0) return "";
  return `${pad}/**\n${lines.join("\n")}\n${pad} */\n`;
}
