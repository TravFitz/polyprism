// PHPDoc block emission for models, fields, and enums.
//
// PHPDoc is the de-facto comment format read by IDEs (PhpStorm, VS Code via
// Intelephense), static analysers (PHPStan, Psalm), and `phpdoc` itself.
// We emit it for:
//   - `///` documentation lines from the Prisma schema (preserved verbatim
//     as the doc body)
//   - `@deprecated` tags (with optional reason from `@deprecated("reason")`)
//   - `@db.X(precision, scale)` native-type metadata (kept as a tag because
//     PHP has no native Decimal precision generics, same reasoning as the
//     TS family — precision is schema-level info worth preserving)
//   - PHPDoc `@var` hints for list types — PHP's native `array` doesn't
//     carry an element type, so we annotate with `@var array<int, Type>`
//     so static analysers see the intended shape.
//
// The output is always either:
//   - empty string (no doc, no tags, no extras → no block)
//   - a multi-line `/** ... */` block ending with a newline

import type { AnnotationSet, FieldDef, NativeType } from "@polyprism/core";

export interface RenderPhpDocOptions {
  /** Number of leading spaces before each `*` line. 0 for top-level, 4 for class members. */
  readonly indent: number;
  /** Optional extra tag lines, each as `@tag content` without the leading `* `. */
  readonly extraTags?: readonly string[];
}

export function renderPhpDoc(annotations: AnnotationSet, opts: RenderPhpDocOptions): string {
  const lines: string[] = [];

  if (annotations.documentation) {
    for (const docLine of annotations.documentation.split("\n")) {
      lines.push(docLine);
    }
  }

  if (annotations.deprecated) {
    const reason = annotations.deprecated.reason;
    // PHPDoc `@deprecated` follows the same shape as JSDoc/Javadoc.
    lines.push(reason ? `@deprecated ${reason}` : "@deprecated");
  }

  for (const tag of opts.extraTags ?? []) {
    lines.push(tag);
  }

  if (lines.length === 0) return "";

  const pad = " ".repeat(opts.indent);
  const body = lines.map((line) => `${pad} * ${line}`).join("\n");
  return `${pad}/**\n${body}\n${pad} */\n`;
}

/**
 * Build the @db.X native-type tag line if the field has Prisma native-type
 * metadata. Returns null if none — caller spreads into extraTags.
 */
export function buildNativeTypeTag(nativeType: NativeType | null): string | null {
  if (!nativeType) return null;
  const args = nativeType.args.join(", ");
  return args ? `@db.${nativeType.name}(${args})` : `@db.${nativeType.name}`;
}

/**
 * Per-field PHPDoc extra-tag set: a `@var array<int, T>` PHPStan-shaped
 * narrowing for list types (because PHP's native `array` doesn't carry an
 * element type), plus any `@db.X(...)` native-type tag the field carries.
 *
 * Shared between `render-model.ts` (php-class / php-readonly) and
 * `render-domain-class.ts` so both renderers emit the same field metadata.
 */
export function collectFieldExtraTags(field: FieldDef, listElementDoc: string | null): string[] {
  const tags: string[] = [];
  if (listElementDoc !== null) {
    tags.push(`@var array<int, ${listElementDoc}>`);
  }
  const nativeTag = buildNativeTypeTag(field.nativeType);
  if (nativeTag) tags.push(nativeTag);
  return tags;
}
