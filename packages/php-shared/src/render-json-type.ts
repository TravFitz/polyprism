// Renders a PHP `final readonly class` for an inline `@json(...)` annotation.
//
// The two inline forms (anonymous and named) carry a TypeScript-shaped
// expression string in the IR (e.g. `{ street: string, city: string,
// addr?: { line1: string } }`). This module parses a small subset of
// that syntax and emits a corresponding PHP readonly value class.
//
// The supported subset is deliberately tight. Anything outside it falls
// back to `mixed` with a warning Diagnostic so the user can either restate
// the shape in supported terms or use `@type("\\App\\YourType")` to point
// at a hand-written PHP class.
//
// Supported:
//   - Flat objects:           `{ a: string, b: int }`
//   - Optional fields:        `{ a?: string }`         → PHP `?string = null`
//   - Nested objects:         `{ a: { b: string } }`   → PHPDoc array{b: string}
//   - Arrays of primitives:   `{ tags: string[] }`     → PHPDoc array<int, string>
//   - Primitives:             string, number, boolean, null, unknown, any
//
// Not supported (warn + fallback to `mixed`):
//   - Unions:                 `string | number`
//   - Generics:               `Record<K, V>`, `Map<K, V>`, etc.
//   - Discriminated unions, tuples, intersection types
//   - Identifier references:  `MyOtherType` inside a JSON expression
//     (use a separate @json(MyOtherType) or @type override instead)
//
// Nested objects intentionally do NOT spawn separate sub-classes. We use
// PHPStan/Psalm-readable `array{...}` shape annotations on a PHP `array`
// property instead. Reasoning: spawning `BillingAddressLocation`,
// `BillingAddressLocationCoords`, etc., would proliferate classes that
// don't really earn their keep, and PHPStan-readable array shapes give
// the same static-analysis story without the file explosion.

import type { Diagnostic } from "./diagnostics.js";
import { renderPhpDoc } from "./phpdoc.js";

export interface RenderJsonTypeOptions {
  /** Top-level class name, e.g. "BillingAddress". */
  readonly typeName: string;
  /** Raw TS expression from the @json annotation, e.g. `{ street: string, city: string }`. */
  readonly typeExpression: string;
  /** PHP namespace the generated class lives in, e.g. `"Generated\\JsonTypes"`. */
  readonly namespace: string;
  /**
   * Context string for diagnostics — typically `"Model.field"` so users can
   * find the schema source of an unsupported-shape warning.
   */
  readonly diagnosticContext: string;
  /**
   * Determines the readonly syntax used:
   *   - `"class"`: emit `final class Foo` with per-property `public readonly`
   *     (works on PHP 8.1). Matches the floor of the `php-class` generator.
   *   - `"readonly"`: emit `final readonly class Foo` (class-level modifier,
   *     PHP 8.2+). Matches the floor of the `php-readonly` generator.
   * Semantically both produce a value object whose properties can't be
   * reassigned after construction; only the syntax differs.
   */
  readonly declarationStyle: "class" | "readonly";
}

export interface RenderJsonTypeResult {
  readonly source: string;
  readonly issues: readonly Diagnostic[];
}

export function renderPhpJsonType(opts: RenderJsonTypeOptions): RenderJsonTypeResult {
  const issues: Diagnostic[] = [];
  const pushIssue = (severity: "warning" | "error", message: string): void => {
    issues.push({ severity, context: opts.diagnosticContext, message });
  };

  const parsed = parseTopLevelObject(opts.typeExpression);
  if (!parsed) {
    pushIssue(
      "warning",
      `@json type expression for "${opts.typeName}" is not a parseable object literal — ` +
        "the PHP emitter only generates classes from top-level `{ ... }` shapes. " +
        'The field falls back to `mixed`. Use `@type("\\\\App\\\\YourType")` to point ' +
        "at a hand-written PHP class instead.",
    );
    return { source: "", issues };
  }

  const phpFields: string[] = [];
  for (const prop of parsed) {
    const mapping = translateTsTypeToPhp(prop.type);
    for (const w of mapping.warnings) {
      pushIssue("warning", `@json field "${opts.typeName}.${prop.name}": ${w}`);
    }

    // Required-first / optional-second ordering happens at the parent class
    // level (render-model.ts) too, but for JSON value classes we keep the
    // simpler "trust the user's ordering" stance — JSON object property
    // order is rarely load-bearing and re-sorting it would surprise users
    // who match the constructor to the original JSON shape.
    // 8-space indent matches the constructor parameter indent below, so
    // the PHPDoc block aligns visually with the property it documents.
    const phpDoc = mapping.phpDocType
      ? `        /**\n         * @var ${mapping.phpDocType}\n         */\n`
      : "";

    const nullableForOptional =
      prop.optional && !alreadyNullable(mapping.phpType) ? `?${mapping.phpType}` : mapping.phpType;
    const defaultExpr = prop.optional ? " = null" : "";
    // For `php-class` mode (PHP 8.1 floor), stamp `readonly` on each
    // property individually since the class-level `readonly` modifier is
    // PHP 8.2-only. For `php-readonly` mode, the class-level modifier
    // already covers every property — adding per-property `readonly`
    // there would be redundant and is rejected by PHP 8.2+.
    const readonlyPrefix = opts.declarationStyle === "class" ? "readonly " : "";
    phpFields.push(
      `${phpDoc}        public ${readonlyPrefix}${nullableForOptional} $${prop.name}${defaultExpr},`,
    );
  }

  // PHP 8.4-deprecation safe: optional (nullable + null default) come after
  // required, preserving JSON-property order within each group.
  const required = phpFields.filter((line) => !line.includes(" = null,"));
  const optional = phpFields.filter((line) => line.includes(" = null,"));
  const promotedBlock =
    phpFields.length > 0 ? `\n${[...required, ...optional].join("\n")}\n    ` : "";

  const headerDoc = renderPhpDoc(
    {
      hide: false,
      deprecated: null,
      json: null,
      type: null,
      name: null,
      normalise: null,
      coerce: null,
      noCoerce: false,
      documentation: `Generated value object for a Prisma Json field. Construct from a decoded JSON payload — e.g. \`new ${opts.typeName}(...$payload)\` or by explicit named arguments.`,
      rawAnnotations: [],
      parseIssues: [],
    },
    { indent: 0 },
  );

  // Class declaration keyword: `final class` + per-property readonly works
  // on PHP 8.1+ and matches the `php-class` floor; `final readonly class`
  // is the cleaner 8.2+ form and matches `php-readonly`. The semantics are
  // identical from the caller's perspective: every property is set in the
  // constructor and never reassigned.
  const classDecl =
    opts.declarationStyle === "readonly"
      ? `final readonly class ${opts.typeName}`
      : `final class ${opts.typeName}`;

  const source = [
    "<?php",
    "",
    "declare(strict_types=1);",
    "",
    `namespace ${opts.namespace};`,
    "",
    `${headerDoc}${classDecl}\n{\n    public function __construct(${promotedBlock}) {}\n}`,
    "",
  ].join("\n");

  return { source, issues };
}

// ---------- parser ----------

interface ParsedProperty {
  readonly name: string;
  readonly optional: boolean;
  /** Raw TS type expression text, trimmed. */
  readonly type: string;
}

/**
 * Parse `{ name: type, ... }` into a flat property list. Returns null if
 * the input isn't shaped like a top-level object literal.
 */
function parseTopLevelObject(expr: string): ParsedProperty[] | null {
  const trimmed = expr.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];

  const parts = splitTopLevel(inner);
  const props: ParsedProperty[] = [];
  for (const part of parts) {
    const parsed = parseProperty(part);
    if (!parsed) return null;
    props.push(parsed);
  }
  return props;
}

/** Parse `name(?)?: type` into the structured form. */
function parseProperty(part: string): ParsedProperty | null {
  // The property name runs up to the first `:` or `?:`. Names can be
  // identifiers; quoted-string keys (`"foo": ...`) aren't supported in v0.
  const colonIdx = findUnnestedChar(part, ":");
  if (colonIdx < 0) return null;

  const nameRaw = part.slice(0, colonIdx).trim();
  const typeRaw = part.slice(colonIdx + 1).trim();
  if (nameRaw.length === 0 || typeRaw.length === 0) return null;

  let name = nameRaw;
  let optional = false;
  if (name.endsWith("?")) {
    optional = true;
    name = name.slice(0, -1).trim();
  }
  // PHP variable names can start with `[A-Za-z_]` and continue with `[\w]`.
  // TS allows `$` in identifiers, but `public string $$foo` is a PHP parse
  // error — silently passing `$`-prefixed names through would write a
  // broken file the consumer only discovers when their PHP autoload trips.
  // Reject here so the parent emits a "not a parseable object literal"
  // warning and the Json field falls back to `mixed`.
  if (!/^[A-Za-z_][\w]*$/.test(name)) return null;

  return { name, optional, type: typeRaw };
}

interface PhpTypeMapping {
  readonly phpType: string;
  /** PHPDoc `@var ...` text when richer typing is needed (lists, nested shapes). */
  readonly phpDocType: string | null;
  readonly warnings: readonly string[];
}

/**
 * Translate a TS type expression to PHP. Returns `mixed` + a warning for
 * anything outside the supported subset, never throws.
 */
function translateTsTypeToPhp(tsType: string): PhpTypeMapping {
  const trimmed = tsType.trim();

  // Trailing `[]` denotes an array. Strip and recurse.
  if (trimmed.endsWith("[]")) {
    const elementType = trimmed.slice(0, -2).trim();
    // Only support primitive element types in v0 — arrays of nested objects
    // would need nested PHPDoc array<int, array{...}> which is supportable
    // but increases the v0 surface area beyond what users have asked for.
    const elementMapping = translateTsTypeToPhp(elementType);
    if (elementMapping.warnings.length > 0) {
      return {
        phpType: "array",
        phpDocType: "array<int, mixed>",
        warnings: elementMapping.warnings,
      };
    }
    return {
      phpType: "array",
      phpDocType: `array<int, ${elementMapping.phpDocType ?? elementMapping.phpType}>`,
      warnings: [],
    };
  }

  // Nested object shape — emit as PHP `array` with PHPDoc array{...} hint.
  if (trimmed.startsWith("{")) {
    const nestedProps = parseTopLevelObject(trimmed);
    if (!nestedProps) {
      return {
        phpType: "mixed",
        phpDocType: null,
        warnings: [`nested object shape "${trimmed}" could not be parsed; falling back to mixed.`],
      };
    }
    const shapeParts: string[] = [];
    const collectedWarnings: string[] = [];
    for (const np of nestedProps) {
      const nm = translateTsTypeToPhp(np.type);
      collectedWarnings.push(...nm.warnings);
      const optionalMarker = np.optional ? "?" : "";
      const phpDocInner = nm.phpDocType ?? nm.phpType;
      shapeParts.push(`${np.name}${optionalMarker}: ${phpDocInner}`);
    }
    return {
      phpType: "array",
      phpDocType: `array{${shapeParts.join(", ")}}`,
      warnings: collectedWarnings,
    };
  }

  // Primitives + a couple of TS-specific "absorb-anything" types.
  switch (trimmed) {
    case "string":
      return { phpType: "string", phpDocType: null, warnings: [] };
    case "number":
      // TS `number` covers both int and float. PHP's `float` accepts both
      // (ints widen automatically), so it's the safest single-type mapping.
      // Document this choice in the README.
      return { phpType: "float", phpDocType: null, warnings: [] };
    case "boolean":
      return { phpType: "bool", phpDocType: null, warnings: [] };
    case "null":
      // Rare standalone — usually appears in a union. If a field's type
      // is literally just `null`, PHP's null type works.
      return { phpType: "null", phpDocType: null, warnings: [] };
    case "unknown":
    case "any":
      return { phpType: "mixed", phpDocType: null, warnings: [] };
  }

  // Anything else (unions, generics, identifiers, tuples) → fallback +
  // warning so the user knows their type lost fidelity.
  return {
    phpType: "mixed",
    phpDocType: null,
    warnings: [
      `TS type "${trimmed}" is not in the PHP @json supported subset (primitives, ` +
        "nested objects, arrays of primitives, optional markers). Falling back to mixed. " +
        'For richer typing, use `@type("\\\\App\\\\YourType")` to point at a hand-written PHP class.',
    ],
  };
}

function alreadyNullable(phpType: string): boolean {
  return phpType.startsWith("?") || phpType === "mixed" || phpType === "null";
}

// ---------- balanced-bracket utilities ----------
//
// These mirror the helpers in @polyprism/core's format-type.ts. They're
// duplicated rather than imported because format-type's helpers aren't
// exported, and tracking a cross-package contract for a 40-line walker
// isn't worth the coupling.

function findUnnestedChar(s: string, char: string): number {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === "\\") {
      isEscaped = true;
      continue;
    }
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    else if (depth === 0 && ch === char) return i;
  }
  return -1;
}

/**
 * Split a top-level property list by `,` or `;`. Both separators are
 * accepted because TS allows either inside object types and interface
 * member lists; users writing inline @json shapes sometimes paste from
 * existing TS declarations that use semicolons.
 */
function splitTopLevel(inner: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;
  let start = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (ch === "\\") {
      isEscaped = true;
      continue;
    }
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    else if ((ch === "," || ch === ";") && depth === 0) {
      const part = inner.slice(start, i).trim();
      if (part.length > 0) result.push(part);
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last.length > 0) result.push(last);
  return result;
}
