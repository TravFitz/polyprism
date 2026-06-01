// Stress tests for deeply nested @json type expressions.
//
// The parser uses integer depth counters (not recursion or backtracking regex)
// so depth is bounded only by the input length, not any internal limit.
// These tests verify that:
//   - Nested object literals work at arbitrary depth
//   - Nested generics (<>) work at arbitrary depth
//   - Mixed nesting (objects + generics + tuples + arrays) preserves the
//     full expression intact, byte-for-byte
//   - String-literal awareness holds inside deep nesting
//   - Multi-line continuation works with deep structures
//   - Form 4 (`Name = ...`) correctly locates the top-level `=` even when
//     deeply nested structures sit on the right-hand side
//
// The output of Form 3 is `typeExpression: <raw string>`, which the renderer
// dumps verbatim into a `.ts` file. So our job is to capture the expression
// faithfully — TypeScript itself decides whether it's valid syntax.

import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";

function parseJson(input: string) {
  return parseAnnotations(input).json;
}

/** Build a chain of nested object literals: `{ a: { a: { ... { a: T } } } }`. */
function buildNestedObject(depth: number, leaf = "string"): string {
  if (depth <= 0) return leaf;
  return `{ a: ${buildNestedObject(depth - 1, leaf)} }`;
}

/** Build nested generics: `Promise<Promise<...<T>...>>`. */
function buildNestedGeneric(depth: number, leaf = "string"): string {
  if (depth <= 0) return leaf;
  return `Promise<${buildNestedGeneric(depth - 1, leaf)}>`;
}

/** Build nested tuples: `[[[...[T, U]...]]]`. */
function buildNestedTuple(depth: number): string {
  if (depth <= 0) return "[string, number]";
  return `[${buildNestedTuple(depth - 1)}]`;
}

// ────────────────────────────────────────────────────────────────────────────
// Object literal nesting
// ────────────────────────────────────────────────────────────────────────────

describe("@json — deeply nested object literals", () => {
  it("5 levels deep", () => {
    const expr = buildNestedObject(5);
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("10 levels deep", () => {
    const expr = buildNestedObject(10);
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("50 levels deep", () => {
    const expr = buildNestedObject(50);
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("100 levels deep — sanity that depth is bounded only by input length", () => {
    const expr = buildNestedObject(100);
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Generic nesting (angle-bracket depth)
// ────────────────────────────────────────────────────────────────────────────

describe("@json — deeply nested generics", () => {
  it("5 levels deep", () => {
    const expr = buildNestedGeneric(5);
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("20 levels deep", () => {
    const expr = buildNestedGeneric(20);
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("mixed generic with multiple type args", () => {
    const expr = "Map<string, Map<string, Map<string, Map<string, number>>>>";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tuple nesting (bracket depth)
// ────────────────────────────────────────────────────────────────────────────

describe("@json — deeply nested tuples", () => {
  it("5 levels deep", () => {
    const expr = buildNestedTuple(5);
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("20 levels deep", () => {
    const expr = buildNestedTuple(20);
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Mixed nesting — the realistic shapes
// ────────────────────────────────────────────────────────────────────────────

describe("@json — mixed deep nesting", () => {
  it("arrays of objects of arrays of objects", () => {
    const expr = "Array<{ items: Array<{ tags: Array<{ name: string, weight: number }> }> }>";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("generic over object over generic over object", () => {
    const expr = "Promise<{ result: Map<string, { items: Array<{ id: string }> }> }>";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("discriminated union with deeply nested variants", () => {
    const expr = [
      '{ type: "a", data: { items: Array<{ id: string }> } }',
      '| { type: "b", data: { items: Array<{ name: string, refs: Array<{ ref: string }> }> } }',
      '| { type: "c", data: Promise<Map<string, Set<number>>> }',
    ].join(" ");
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("realistic GraphQL-shaped response type", () => {
    const expr =
      "{ data: { user: { id: string, profile: { settings: { theme: string, notifications: { email: boolean, sms: boolean, push: { enabled: boolean, channels: Array<string> } } } } } }, errors: Array<{ message: string, path: Array<string | number>, extensions: { code: string, details: Record<string, unknown> } }> | null }";
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("nested function types with generic params", () => {
    const expr =
      "(handler: (event: { type: string, payload: { items: Array<{ id: string }> } }) => Promise<{ ok: boolean }>) => void";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// String literals inside deep nesting
// ────────────────────────────────────────────────────────────────────────────

describe("@json — string-literal awareness within deep nesting", () => {
  it("string containing close-brace at 5 levels deep", () => {
    const expr = '{ a: { b: { c: { d: { msg: "this } looks like close" } } } } }';
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("string containing equals at 5 levels deep doesn't trigger Form 4", () => {
    const expr = '{ a: { b: { c: { d: { msg: "x = y" } } } } }';
    const result = parseJson(`@json(${expr})`);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("template literal with `=` inside, deeply nested", () => {
    const expr = "{ a: { b: { kind: `key=value` } } }";
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("escaped quotes inside string at deep depth", () => {
    const expr = '{ a: { b: { c: { msg: "she said \\"hi\\"" } } } }';
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });

  it("multiple string literals containing structural chars at depth", () => {
    const expr = '{ a: { msg1: "{[(<", msg2: ")>]}", msg3: "= == => != >=", msg4: "a, b, c" } }';
    expect(parseJson(`@json(${expr})`)).toEqual({
      kind: "inline-anonymous",
      typeExpression: expr,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 4 with deeply nested RHS
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 4 with deeply nested expression", () => {
  it("named object nested 10 deep", () => {
    const expr = buildNestedObject(10);
    expect(parseJson(`@json(DeepShape = ${expr})`)).toEqual({
      kind: "inline-named",
      typeName: "DeepShape",
      typeExpression: expr,
    });
  });

  it("named generic nested 20 deep", () => {
    const expr = buildNestedGeneric(20);
    expect(parseJson(`@json(DeepGeneric = ${expr})`)).toEqual({
      kind: "inline-named",
      typeName: "DeepGeneric",
      typeExpression: expr,
    });
  });

  it("named with mixed deep nesting", () => {
    const expr =
      "{ payload: Array<{ event: { type: string, data: Map<string, { count: number }> } }> }";
    expect(parseJson(`@json(EventEnvelope = ${expr})`)).toEqual({
      kind: "inline-named",
      typeName: "EventEnvelope",
      typeExpression: expr,
    });
  });

  it("named with `=` inside deeply nested generics (Foo<T = U>)", () => {
    // `Foo<T = U>` has `=` inside `<>` — must not be picked up as Form 4 separator
    const expr = "Promise<Foo<T = string, U = number>>";
    expect(parseJson(`@json(MyType = ${expr})`)).toEqual({
      kind: "inline-named",
      typeName: "MyType",
      typeExpression: expr,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Multi-line deeply nested
// ────────────────────────────────────────────────────────────────────────────

describe("@json — multi-line deeply nested", () => {
  it("multi-line deeply nested object", () => {
    const input = [
      "@json({",
      "  level1: {",
      "    level2: {",
      "      level3: {",
      "        level4: {",
      "          leaf: string,",
      "        },",
      "      },",
      "    },",
      "  },",
      "})",
    ].join("\n");
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("multi-line discriminated union with deep variants", () => {
    const input = [
      "@json(",
      '  { type: "a", data: { items: Array<{ id: string }> } }',
      '  | { type: "b", data: Map<string, { count: number }> }',
      '  | { type: "c", data: Promise<Array<number>> }',
      ")",
    ].join("\n");
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("multi-line Form 4 with deep nested RHS", () => {
    const input = [
      "@json(EventEnvelope = {",
      "  meta: {",
      "    source: string,",
      "    ts: number,",
      "  },",
      "  payload: Array<{",
      "    type: string,",
      "    data: Map<string, {",
      "      count: number,",
      "      tags: Array<string>,",
      "    }>,",
      "  }>,",
      "})",
    ].join("\n");
    const result = parseJson(input);
    expect(result).toMatchObject({ kind: "inline-named", typeName: "EventEnvelope" });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Performance sanity — O(n) over input length, not O(n^2) or worse
// ────────────────────────────────────────────────────────────────────────────

describe("@json — performance sanity at depth", () => {
  it("parses 500-level-deep object in well under 100ms", () => {
    const expr = buildNestedObject(500);
    const input = `@json(${expr})`;
    const start = performance.now();
    const result = parseJson(input);
    const elapsed = performance.now() - start;
    expect(result?.kind).toBe("inline-anonymous");
    expect(elapsed).toBeLessThan(100);
  });

  it("parses 1000-level-deep generic in well under 100ms", () => {
    const expr = buildNestedGeneric(1000);
    const input = `@json(${expr})`;
    const start = performance.now();
    const result = parseJson(input);
    const elapsed = performance.now() - start;
    expect(result?.kind).toBe("inline-anonymous");
    expect(elapsed).toBeLessThan(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Byte-for-byte fidelity — captured expression matches input exactly
// ────────────────────────────────────────────────────────────────────────────

describe("@json — byte-for-byte fidelity", () => {
  it("captured expression equals input for object literal", () => {
    const expr = "{ a: { b: { c: string } } }";
    const result = parseJson(`@json(${expr})`);
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("captured expression preserves whitespace inside braces", () => {
    const expr = "{  a:   string  ,  b:   number  }";
    const result = parseJson(`@json(${expr})`);
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("captured expression preserves comments-less verbose objects", () => {
    const expr = "{ a: string; b: number; c: boolean }";
    const result = parseJson(`@json(${expr})`);
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });

  it("captured expression preserves unicode characters in string values", () => {
    const expr = '{ greeting: "héllo 🌟 wörld", emoji: "🔥" }';
    const result = parseJson(`@json(${expr})`);
    expect((result as { typeExpression: string }).typeExpression).toBe(expr);
  });
});
