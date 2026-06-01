// Pretty-formats a TypeScript type expression for emission.
//
// Goals:
//   - Object literals (`{ ... }`) with multiple properties break onto lines
//   - Single-property and empty objects stay on one line
//   - Tuples (`[...]`), generics (`<...>`), unions (`a | b`), functions
//     (`(x) => y`) are left untouched (they're usually short enough)
//   - Strings, template literals, and isEscaped sequences are opaque
//   - Idempotent — re-formatting formatted output yields the same string
//
// Not a full TS-AST formatter; just a structural prettifier for the inline
// `@json({...})` annotation outputs that would otherwise be unreadable
// one-liners.

const INDENT_UNIT = "  ";

export function prettyFormatType(expr: string): string {
  const out: string[] = [];
  formatInto(expr.trim(), 0, out);
  return out.join("");
}

function formatInto(expr: string, depth: number, out: string[]): void {
  let i = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;

  while (i < expr.length) {
    const ch = expr[i]!;

    if (isEscaped) {
      out.push(ch);
      isEscaped = false;
      i++;
      continue;
    }
    if (ch === "\\") {
      out.push(ch);
      isEscaped = true;
      i++;
      continue;
    }
    if (inString) {
      out.push(ch);
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      out.push(ch);
      inString = ch;
      i++;
      continue;
    }

    if (ch === "{") {
      const closeIdx = findMatching(expr, i, "{", "}");
      const inner = expr.slice(i + 1, closeIdx).trim();

      if (inner.length === 0) {
        out.push("{}");
      } else if (!hasTopLevelSeparator(inner)) {
        // Single-property or single-expression object — keep on one line.
        out.push("{ ");
        formatInto(inner, depth, out);
        out.push(" }");
      } else {
        // Multi-property — break onto lines.
        const innerIndent = INDENT_UNIT.repeat(depth + 1);
        out.push("{\n");
        const props = splitTopLevel(inner);
        for (let p = 0; p < props.length; p++) {
          out.push(innerIndent);
          formatInto(props[p]!.content, depth + 1, out);
          out.push(";");
          out.push("\n");
        }
        out.push(`${INDENT_UNIT.repeat(depth)}}`);
      }
      i = closeIdx + 1;
      continue;
    }

    out.push(ch);
    i++;
  }
}

function findMatching(s: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;
  for (let i = openIdx; i < s.length; i++) {
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
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

function hasTopLevelSeparator(inner: string): boolean {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let isEscaped = false;
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
    else if ((ch === "," || ch === ";") && depth === 0) return true;
  }
  return false;
}

function splitTopLevel(inner: string): Array<{ content: string }> {
  const result: Array<{ content: string }> = [];
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
      const content = inner.slice(start, i).trim();
      if (content.length > 0) result.push({ content });
      start = i + 1;
    }
  }

  const lastContent = inner.slice(start).trim();
  if (lastContent.length > 0) result.push({ content: lastContent });

  return result;
}
