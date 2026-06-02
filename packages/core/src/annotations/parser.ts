// Annotation parser for PolyPrism doc-comment annotations.
//
// Grammar (v0.1):
//   line       = '@' ident                          // @hide
//              | '@' ident '(' args ')'             // @deprecated("…"), @json(…), …
//              | '[' ident ']'                      // prisma-json-types-generator compat alias
//              | <free text>                        // preserved as documentation
//
// Multi-line annotations are supported: if a line opens '(' or '{' and
// doesn't close it, subsequent lines are concatenated until parens balance.
// String literals are respected during the depth tracking so a brace inside
// a string doesn't unbalance the depth.

import type {
  AnnotationSet,
  CoerceTo,
  JsonAnnotation,
  NormaliseOp,
  TypeOverride,
} from "../ir/types.js";

const VALID_NORMALISE_OPS = new Set<NormaliseOp>([
  "trim",
  "lowercase",
  "uppercase",
  "nullEmptyToNull",
]);

const VALID_COERCE_TARGETS = new Set<CoerceTo>(["date", "int", "float", "decimal", "string"]);

/**
 * Parse a documentation string into an AnnotationSet.
 * Lines that aren't annotations are preserved in `documentation`.
 */
export function parseAnnotations(doc: string | null): AnnotationSet {
  const result: AnnotationSet = {
    hide: false,
    deprecated: null,
    json: null,
    type: null,
    name: null,
    normalise: null,
    coerce: null,
    noCoerce: false,
    documentation: null,
    rawAnnotations: [],
    parseIssues: [],
  };
  const parseIssues: { severity: "error" | "warning"; message: string }[] = [];

  if (!doc) return result;

  const logicalLines = splitLogicalLines(doc);
  const docLines: string[] = [];
  const rawAnnotations: string[] = [];

  for (const line of logicalLines) {
    const trimmed = line.trim();

    // Shorthand: [TypeName] → @json(TypeName)
    const bracketMatch = /^\[(\w+)\]$/.exec(trimmed);
    if (bracketMatch) {
      result.json = { kind: "bare", typeName: bracketMatch[1]! };
      rawAnnotations.push(trimmed);
      continue;
    }

    // @ident or @ident(args)
    const annotationMatch = /^@(\w+)(?:\s*\(([\s\S]*)\))?$/.exec(trimmed);
    if (annotationMatch) {
      applyAnnotation(annotationMatch[1]!, annotationMatch[2] ?? null, result, parseIssues);
      rawAnnotations.push(trimmed);
      continue;
    }

    // Not an annotation — preserve as documentation
    docLines.push(line);
  }

  const joinedDoc = docLines.join("\n").trim();
  result.documentation = joinedDoc.length > 0 ? joinedDoc : null;
  result.rawAnnotations = rawAnnotations;
  result.parseIssues = parseIssues;
  return result;
}

/**
 * Split a multi-line doc string into logical lines, joining continuations
 * where parens or braces remain open. Respects string literals.
 */
function splitLogicalLines(doc: string): string[] {
  const physical = doc.split("\n");
  const logical: string[] = [];
  let buffer = "";
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;

  for (const line of physical) {
    for (const ch of line) {
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
      // String-literal tracking is meant for annotation args like
      // `@deprecated("use newName")` and `@json({ s: "x" })` where braces /
      // parens inside a quoted segment must not unbalance the depth count.
      // Plain documentation text like "Shopify's GraphQL API" contains
      // apostrophes that shouldn't open string mode — they're prose, not
      // syntax — so we only enter string mode when actually inside a
      // parens/braces/brackets block.
      const insideBlock = parenDepth > 0 || braceDepth > 0 || bracketDepth > 0;
      if (insideBlock && (ch === '"' || ch === "'" || ch === "`")) {
        inString = ch;
        continue;
      }
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      else if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
      else if (ch === "[") bracketDepth++;
      else if (ch === "]") bracketDepth--;
    }

    buffer = buffer.length === 0 ? line : `${buffer} ${line.trim()}`;

    if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && inString === null) {
      logical.push(buffer);
      buffer = "";
    }
  }

  if (buffer.length > 0) logical.push(buffer);
  return logical;
}

function applyAnnotation(
  name: string,
  args: string | null,
  set: AnnotationSet,
  parseIssues: { severity: "error" | "warning"; message: string }[],
): void {
  switch (name) {
    case "hide":
      set.hide = true;
      return;
    case "deprecated":
      set.deprecated = { reason: args ? extractStringArg(args) : null };
      return;
    case "json":
      set.json = parseJsonArgs(args, parseIssues);
      return;
    case "type":
      set.type = parseTypeArgs(args);
      return;
    case "name":
      set.name = args ? args.trim() : null;
      return;
    case "normalise":
    case "normalize":
      set.normalise = parseNormaliseArgs(args);
      return;
    case "coerce":
      set.coerce = parseCoerceArg(args);
      return;
    case "noCoerce":
      // Takes no args. We tolerate `@noCoerce()` (empty parens) too — the
      // regex captures args as either null or an empty/whitespace string.
      // Non-empty args are accepted but warned-on, because `@noCoerce(int)`
      // reads like it means something specific ("don't coerce ints") when
      // it actually does the same thing as bare `@noCoerce`.
      if (args !== null && args.trim().length > 0) {
        parseIssues.push({
          severity: "warning",
          message:
            `@noCoerce takes no arguments — got '${args.trim()}', which has been ignored. ` +
            `Use bare \`@noCoerce\` to opt this field out of default coercion.`,
        });
      }
      set.noCoerce = true;
      return;
    default:
      // Unknown annotation — already captured in rawAnnotations; ignored otherwise.
      return;
  }
}

function parseJsonArgs(
  args: string | null,
  parseIssues: { severity: "error" | "warning"; message: string }[],
): JsonAnnotation | null {
  if (!args) return null;
  const trimmed = args.trim();
  if (trimmed.length === 0) return null;

  // Bracket-shorthand misuse: `@json([Foo])` looks like the user meant "array
  // of Foo", but TS reads `[Foo]` as a single-element tuple. The user-facing
  // bracket shorthand (`/// [TypeName]` at line level) doesn't connote arrays
  // either — it's just a brevity form for naming a Json type. We DWIM-rewrite
  // `@json([X])` to `@json(X[])` because that's the user's almost-certain
  // intent, and emit a warning so the surprise is visible.
  //
  // Escape hatch for the rare "I genuinely want a tuple-of-one" case: write
  // `@json([X, ])` with a trailing comma — this regex won't match.
  const bracketShorthandAbuse = /^\[\s*(\w+)\s*\]$/.exec(trimmed);
  if (bracketShorthandAbuse) {
    const inner = bracketShorthandAbuse[1]!;
    parseIssues.push({
      severity: "warning",
      message:
        `@json([${inner}]) emits a tuple-of-one type in TypeScript, almost never the intent. ` +
        `Treating as @json(${inner}[]) (array of ${inner}). For the literal tuple-of-one, use @json([${inner}, ]) with a trailing comma.`,
    });
    return { kind: "inline-anonymous", typeExpression: `${inner}[]` };
  }

  // Form 2: with-path — `TypeName from "./path"` or `TypeName[] from "./path"`.
  // Check first so the assignment scan below doesn't get confused by paths
  // containing characters that look operator-like. The optional `[]` suffix
  // covers the canonical "Json column holds an array of an imported type"
  // case — natural shape for any `Json @default("[]")` column. Without this,
  // users have to either declare a wrapper alias (`type Xs = X[]`) or import
  // X globally via prisma-json-types-style convention.
  const pathMatch = /^(\w+)(\[\])?\s+from\s+["'](.+)["']$/.exec(trimmed);
  if (pathMatch) {
    const isArray = pathMatch[2] === "[]";
    return {
      kind: "with-path",
      typeName: pathMatch[1]!,
      importPath: pathMatch[3]!,
      ...(isArray ? { isArray: true } : {}),
    };
  }

  // Form 4: inline named — `Name = expression`
  // Locate a top-level `=` that's NOT inside braces/parens/brackets/angles,
  // NOT inside a string/template-literal, and NOT part of a compound operator
  // (`==`, `=>`, `!=`, `<=`, `>=`).
  const eqIndex = findTopLevelAssignment(trimmed);
  if (eqIndex > 0) {
    const namePart = trimmed.slice(0, eqIndex).trim();
    const exprPart = trimmed.slice(eqIndex + 1).trim();
    if (/^\w+$/.test(namePart) && exprPart.length > 0) {
      return { kind: "inline-named", typeName: namePart, typeExpression: exprPart };
    }
  }

  // Form 1: bare — a single identifier and nothing else.
  if (/^\w+$/.test(trimmed)) {
    return { kind: "bare", typeName: trimmed };
  }

  // Form 3: inline anonymous — anything else with structure.
  // We don't validate TS syntax; the user's tsc will catch invalid expressions.
  return { kind: "inline-anonymous", typeExpression: trimmed };
}

/**
 * Find the index of the first top-level `=` character in a TS-type-like
 * expression, or -1 if none exists. Respects:
 *   - depth tracking for `{}`, `()`, `[]`, `<>` (angles treated as generic brackets)
 *   - string and template-literal regions (`"..."`, `'...'`, `` `...` ``)
 *   - isEscaped sequences (`\` skips the next char inside strings)
 *   - compound operators (`==`, `=>`, `!=`, `<=`, `>=`, `===`, `!==`)
 */
function findTopLevelAssignment(s: string): number {
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
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") {
      depth++;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]" || ch === ">") {
      depth--;
      continue;
    }
    if (ch === "=" && depth === 0) {
      const prev = i > 0 ? s[i - 1] : "";
      const next = i + 1 < s.length ? s[i + 1] : "";
      // Compound operators we should NOT treat as the assignment `=`:
      //   `==`  `===`  `=>`  `!=`  `!==`  `<=`  `>=`
      if (next === "=" || next === ">") continue;
      if (prev === "=" || prev === "!" || prev === "<" || prev === ">") continue;
      return i;
    }
  }
  return -1;
}

function parseTypeArgs(args: string | null): TypeOverride | null {
  if (!args) return null;
  const trimmed = args.trim();

  const pathMatch = /^(\w+)\s+from\s+["'](.+)["']$/.exec(trimmed);
  if (pathMatch) {
    return { typeName: pathMatch[1]!, importPath: pathMatch[2]! };
  }

  if (/^\w+$/.test(trimmed)) {
    return { typeName: trimmed, importPath: null };
  }

  return null;
}

function parseNormaliseArgs(args: string | null): readonly NormaliseOp[] | null {
  if (!args) return null;
  const ops = args
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s): s is NormaliseOp => VALID_NORMALISE_OPS.has(s as NormaliseOp));
  return ops.length > 0 ? ops : null;
}

function parseCoerceArg(args: string | null): CoerceTo | null {
  if (!args) return null;
  const trimmed = args.trim();
  return VALID_COERCE_TARGETS.has(trimmed as CoerceTo) ? (trimmed as CoerceTo) : null;
}

function extractStringArg(args: string): string | null {
  const trimmed = args.trim();
  const match = /^["'](.*)["']$/s.exec(trimmed);
  return match ? match[1]! : trimmed;
}
