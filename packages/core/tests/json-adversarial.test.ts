// Adversarial tests for the @json annotation parser.
//
// What this file is FOR:
//   - Verifying the parser never crashes, hangs, or infinite-loops on
//     malformed input
//   - Documenting which inputs we accept-but-pass-through (TS will reject
//     later, which is fine), vs which we reject explicitly
//   - Catching regressions when we harden the parser
//
// What this file is NOT for:
//   - Validating that the output is valid TypeScript (we don't validate TS
//     syntax — that's the user's tsc's job)

import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";

function parseJson(input: string) {
  return parseAnnotations(input).json;
}

// ────────────────────────────────────────────────────────────────────────────
// Empty / whitespace inputs — must not crash
// ────────────────────────────────────────────────────────────────────────────

describe("@json — empty / whitespace inputs", () => {
  it("empty parens returns null", () => {
    expect(parseJson("@json()")).toBeNull();
  });

  it("whitespace-only returns null", () => {
    expect(parseJson("@json(\n\n\n)")).toBeNull();
  });

  it("just a newline doesn't hang", () => {
    expect(parseJson("@json(\n)")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Invalid identifiers — accepted, downstream TS will reject
// ────────────────────────────────────────────────────────────────────────────

describe("@json — invalid TS identifiers (accepted, TS rejects later)", () => {
  it("digit-leading name is technically captured but invalid TS", () => {
    // \w matches digits so `123` passes the regex. Producing valid-or-not
    // TS is the user's problem; parser shouldn't crash.
    const result = parseJson("@json(123 = { a: string })");
    expect(result).not.toBeNull();
  });

  it("reserved keyword as bare type name passes through", () => {
    // `class` is a reserved word — invalid as a type name in user code,
    // but parser accepts it because \w+ matches.
    expect(parseJson("@json(class)")).toEqual({ kind: "bare", typeName: "class" });
  });

  it("primitive keywords as bare type names pass through", () => {
    expect(parseJson("@json(string)")).toEqual({ kind: "bare", typeName: "string" });
    expect(parseJson("@json(number)")).toEqual({ kind: "bare", typeName: "number" });
    expect(parseJson("@json(null)")).toEqual({ kind: "bare", typeName: "null" });
    expect(parseJson("@json(unknown)")).toEqual({ kind: "bare", typeName: "unknown" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Malformed TS expressions — passed through as Form 3
// ────────────────────────────────────────────────────────────────────────────

describe("@json — malformed TS expressions (passed through, TS rejects later)", () => {
  it("missing type after colon", () => {
    const result = parseJson("@json({ a: })");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("missing colon between key and type", () => {
    const result = parseJson("@json({ a string })");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("missing property name", () => {
    const result = parseJson("@json({ : string })");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("dangling operator", () => {
    const result = parseJson("@json(string | )");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("dangling generic angle", () => {
    const result = parseJson("@json(Array<)");
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Mismatched brackets — must not infinite-loop or crash
// ────────────────────────────────────────────────────────────────────────────

describe("@json — mismatched brackets", () => {
  it("unclosed brace doesn't hang", () => {
    // The parser will keep reading until end of input. As long as it
    // terminates with some result (even garbage), we're OK.
    const result = parseJson("@json({ a: string");
    // We don't care WHAT it produces — only that it terminates.
    expect(result).not.toBeUndefined();
  });

  it("unclosed angle bracket doesn't hang", () => {
    const result = parseJson("@json(Array<string");
    expect(result).not.toBeUndefined();
  });

  it("unclosed paren doesn't hang", () => {
    const result = parseJson("@json((x: string");
    expect(result).not.toBeUndefined();
  });

  it("extra close brace doesn't hang", () => {
    const result = parseJson("@json({ a: string }})");
    expect(result).not.toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// String / quote edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("@json — string and quote edge cases", () => {
  it("unterminated double-quoted string doesn't hang", () => {
    const result = parseJson('@json({ msg: "unterminated })');
    expect(result).not.toBeUndefined();
  });

  it("unterminated single-quoted string doesn't hang", () => {
    const result = parseJson("@json({ msg: 'unterminated })");
    expect(result).not.toBeUndefined();
  });

  it("unterminated backtick doesn't hang", () => {
    const result = parseJson("@json({ kind: `unterminated })");
    expect(result).not.toBeUndefined();
  });

  it("backslash at end of string", () => {
    // `"foo\"` — the trailing `"` is escaped, so the string isn't terminated.
    // This could trip up our string tracker. Test that it doesn't hang.
    const result = parseJson('@json({ msg: "foo\\" })');
    expect(result).not.toBeUndefined();
  });

  it("escaped backslash before quote correctly terminates string", () => {
    // `"foo\\"` — the `\\` is an escaped backslash, so the next `"` DOES
    // close the string.
    expect(parseJson('@json({ msg: "foo\\\\", x: number })')).toMatchObject({
      kind: "inline-anonymous",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 2 (with-path) edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 2 (with-path) edge cases", () => {
  it("empty path string — currently accepted (TS will fail to resolve)", () => {
    const result = parseJson('@json(Foo from "")');
    // Empty path technically matches our regex. Document the behaviour.
    // Downstream TS will fail to find the module — graceful enough.
    expect(result).not.toBeUndefined();
  });

  it("path with internal quote of the OTHER kind", () => {
    // Double-quoted path containing a literal single quote — should work
    // because the regex captures non-greedy by quote kind.
    expect(parseJson('@json(Foo from "./path-with-\'-in-it")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./path-with-'-in-it",
    });
  });

  it("missing `from` keyword falls through to Form 3", () => {
    const result = parseJson('@json(Foo "./path")');
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("misspelled `from` (e.g., FROM) falls through to Form 3", () => {
    // We're case-sensitive on `from`. Documented limitation.
    const result = parseJson('@json(Foo FROM "./path")');
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 4 edge cases
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 4 (inline named) edge cases", () => {
  it("invalid identifier name → falls through to Form 3", () => {
    // `Foo.Bar` isn't a simple identifier; namePart fails `\w+` check.
    const result = parseJson("@json(Foo.Bar = string)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("digit-only name still matches \\w+ regex (accepted, invalid TS)", () => {
    // `\w+` matches all-digit strings. We accept; TS will reject.
    expect(parseJson("@json(123 = string)")).toEqual({
      kind: "inline-named",
      typeName: "123",
      typeExpression: "string",
    });
  });

  it("name with space falls through", () => {
    const result = parseJson("@json(Foo Bar = string)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("empty RHS after `=` falls through to Form 3", () => {
    const result = parseJson("@json(Foo =)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("RHS with only whitespace falls through", () => {
    const result = parseJson("@json(Foo =   )");
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Comments and esoteric syntax
// ────────────────────────────────────────────────────────────────────────────

describe("@json — comments and unusual syntax", () => {
  it("block comment inside expression passes through", () => {
    // We don't strip comments; TS will handle them.
    const result = parseJson("@json({ /* comment */ a: string })");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("line comment inside expression passes through", () => {
    const result = parseJson("@json({ a: string // line comment\n})");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("typeof expression passes through", () => {
    expect(parseJson("@json(typeof foo)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "typeof foo",
    });
  });

  it("keyof expression passes through", () => {
    expect(parseJson("@json(keyof T)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "keyof T",
    });
  });

  it("conditional type passes through", () => {
    const expr = "T extends U ? X : Y";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("mapped type passes through", () => {
    const expr = "{ [K in keyof T]: T[K] | null }";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Recursive / self-referential
// ────────────────────────────────────────────────────────────────────────────

describe("@json — recursive references in inline types", () => {
  it("self-referential inline-named type is valid TS and passes through", () => {
    expect(parseJson("@json(Tree = { value: string, children: Tree[] })")).toEqual({
      kind: "inline-named",
      typeName: "Tree",
      typeExpression: "{ value: string, children: Tree[] }",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unicode and exotic characters
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Unicode and exotic characters", () => {
  it("Unicode identifier falls through to Form 3 (known limitation)", () => {
    const result = parseJson("@json(Πάρτι)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("emoji in string value is preserved", () => {
    expect(parseJson('@json({ greeting: "héllo 🌟" })')).toMatchObject({
      kind: "inline-anonymous",
      typeExpression: '{ greeting: "héllo 🌟" }',
    });
  });

  it("zero-width space in identifier is silently included (invalid TS)", () => {
    // ZWSP between `a` and `b` makes it look like one identifier
    // visually but it's not. Parser accepts; TS will likely accept too
    // since some implementations treat ZWSP as ID_Continue.
    const result = parseJson("@json({ a​b: string })");
    expect(result).not.toBeUndefined();
  });

  it("null byte in identifier doesn't crash (parser is char-array safe)", () => {
    const result = parseJson("@json({ a b: string })");
    expect(result).not.toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Size / performance robustness
// ────────────────────────────────────────────────────────────────────────────

describe("@json — large inputs don't hang", () => {
  it("10kb single-property object parses in under 100ms", () => {
    // Generate an object with a long property name
    const longName = "a".repeat(10_000);
    const expr = `{ ${longName}: string }`;
    const start = performance.now();
    const result = parseJson(`@json(${expr})`);
    const elapsed = performance.now() - start;
    expect(result?.kind).toBe("inline-anonymous");
    expect(elapsed).toBeLessThan(100);
  });

  it("1000-property object parses in under 100ms", () => {
    const props = Array.from({ length: 1000 }, (_, i) => `f${i}: string`).join(", ");
    const expr = `{ ${props} }`;
    const start = performance.now();
    const result = parseJson(`@json(${expr})`);
    const elapsed = performance.now() - start;
    expect(result?.kind).toBe("inline-anonymous");
    expect(elapsed).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cross-form ambiguity
// ────────────────────────────────────────────────────────────────────────────

describe("@json — cross-form ambiguity resolution", () => {
  it("`Foo from ...` is always Form 2, not Form 4 even with `=`", () => {
    // Edge case: what if someone writes `Foo from "./path = bar"`?
    // The Form 2 regex matches first, so it wins.
    expect(parseJson('@json(Foo from "./path = bar")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./path = bar",
    });
  });

  it('`Foo = something from "./path"` is Form 4, not Form 2', () => {
    // The `from` here is part of the expression, not the Form 2 marker.
    // Form 2 regex requires `^\w+ from ... $` (entire string).
    // Form 4 finds top-level `=` first.
    expect(parseJson('@json(Foo = SomeType from "./path")')).toEqual({
      kind: "inline-named",
      typeName: "Foo",
      typeExpression: 'SomeType from "./path"',
    });
  });
});
