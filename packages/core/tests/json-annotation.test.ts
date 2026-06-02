// Comprehensive tests for the @json annotation parser.
// The @json annotation is the surface that touches user-defined TS type
// expressions — it has to handle a wide range of valid TS syntax correctly,
// because getting it wrong produces broken generated types.
//
// Form summary:
//   1. @json(TypeName)                              → bare reference
//   2. @json(TypeName from "./path")                → with-path reference
//   3. @json(<any inline TS type expression>)       → inline anonymous (auto-named)
//   4. @json(Name = <any inline TS type expression>) → inline named
//   shorthand: [TypeName]                            → alias for Form 1

import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";

/** Helper that runs the parser and asserts there's only one annotation parsed. */
function parseJson(input: string) {
  const result = parseAnnotations(input);
  return result.json;
}

// ────────────────────────────────────────────────────────────────────────────
// Form 1 — bare reference
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 1 (bare reference)", () => {
  it("PascalCase identifier", () => {
    expect(parseJson("@json(UserMetadata)")).toEqual({
      kind: "bare",
      typeName: "UserMetadata",
    });
  });

  it("camelCase identifier", () => {
    expect(parseJson("@json(userMetadata)")).toEqual({
      kind: "bare",
      typeName: "userMetadata",
    });
  });

  it("snake_case identifier", () => {
    expect(parseJson("@json(user_metadata)")).toEqual({
      kind: "bare",
      typeName: "user_metadata",
    });
  });

  it("identifier with digits", () => {
    expect(parseJson("@json(User2Metadata)")).toEqual({
      kind: "bare",
      typeName: "User2Metadata",
    });
  });

  it("single-letter identifier", () => {
    expect(parseJson("@json(T)")).toEqual({ kind: "bare", typeName: "T" });
  });

  it("identifier with trailing underscore", () => {
    expect(parseJson("@json(Type_)")).toEqual({ kind: "bare", typeName: "Type_" });
  });

  it("identifier with leading underscore", () => {
    expect(parseJson("@json(_Internal)")).toEqual({
      kind: "bare",
      typeName: "_Internal",
    });
  });

  it("identifier with all caps", () => {
    expect(parseJson("@json(JSON)")).toEqual({ kind: "bare", typeName: "JSON" });
  });

  it("identifier with surrounding whitespace", () => {
    expect(parseJson("@json(  UserMetadata  )")).toEqual({
      kind: "bare",
      typeName: "UserMetadata",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 2 — with import path
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 2 (with import path)", () => {
  it("relative path with double quotes", () => {
    expect(parseJson('@json(BillingAddress from "./types/billing")')).toEqual({
      kind: "with-path",
      typeName: "BillingAddress",
      importPath: "./types/billing",
    });
  });

  it("relative path with single quotes", () => {
    expect(parseJson("@json(BillingAddress from './types/billing')")).toEqual({
      kind: "with-path",
      typeName: "BillingAddress",
      importPath: "./types/billing",
    });
  });

  it("path with file extension", () => {
    expect(parseJson('@json(Foo from "./types/foo.ts")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./types/foo.ts",
    });
  });

  it("absolute-style path", () => {
    expect(parseJson('@json(Foo from "/absolute/path/types")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "/absolute/path/types",
    });
  });

  it("scoped package import", () => {
    expect(parseJson('@json(Address from "@mycompany/types")')).toEqual({
      kind: "with-path",
      typeName: "Address",
      importPath: "@mycompany/types",
    });
  });

  it("deeply nested path", () => {
    expect(parseJson('@json(Foo from "./a/b/c/d/e/types")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./a/b/c/d/e/types",
    });
  });

  it("extra whitespace around `from`", () => {
    expect(parseJson('@json(Foo   from   "./bar")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./bar",
    });
  });

  it("path containing dashes and underscores", () => {
    expect(parseJson('@json(Foo from "./my-package_v2/types")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./my-package_v2/types",
    });
  });

  it("path with parent directory traversal", () => {
    expect(parseJson('@json(Foo from "../../types")')).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "../../types",
    });
  });

  it("array combo — `@json(Foo[] from path)` imports Foo and types the field as Foo[]", () => {
    // Natural shape for Json columns that hold a typed array — the dogfood
    // case that triggered the 0.1.4 @json([X]) DWIM but couldn't be fully
    // expressed back then because Form 2 didn't carry an array bit. With
    // this, `countries Json @default("[]")` + `@json(Country[] from "...")`
    // imports the singular `Country` and emits the field type as `Country[]`.
    expect(parseJson('@json(Country[] from "./types/country")')).toEqual({
      kind: "with-path",
      typeName: "Country",
      importPath: "./types/country",
      isArray: true,
    });
  });

  it("array combo — works with single quotes too", () => {
    expect(parseJson("@json(Tag[] from './types/tag')")).toEqual({
      kind: "with-path",
      typeName: "Tag",
      importPath: "./types/tag",
      isArray: true,
    });
  });

  it("array combo — works with deep relative paths and aliased imports", () => {
    expect(
      parseJson('@json(CountryConfig[] from "~/services/inclusive-pricing/CountryConfig")'),
    ).toEqual({
      kind: "with-path",
      typeName: "CountryConfig",
      importPath: "~/services/inclusive-pricing/CountryConfig",
      isArray: true,
    });
  });

  it("array suffix is omitted from the IR (not `isArray: false`) for the non-array form — matches Form 2 baseline", () => {
    // Backward compat: the optional `isArray` field is absent (not explicit
    // false) on the plain form. Test fixtures across the codebase rely on
    // strict `toEqual` against `{ kind, typeName, importPath }` without an
    // `isArray` key — that contract is preserved here.
    const result = parseJson('@json(Foo from "./types/foo")');
    expect(result).toEqual({
      kind: "with-path",
      typeName: "Foo",
      importPath: "./types/foo",
    });
    expect(result).not.toHaveProperty("isArray");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 3 — inline anonymous (the BIG category)
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 3 (inline anonymous, object literals)", () => {
  it("simple object literal", () => {
    expect(parseJson("@json({ name: string })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ name: string }",
    });
  });

  it("multiple properties", () => {
    expect(parseJson("@json({ a: string, b: number, c: boolean })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ a: string, b: number, c: boolean }",
    });
  });

  it("nested object", () => {
    expect(parseJson("@json({ user: { name: string } })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ user: { name: string } }",
    });
  });

  it("deeply nested object", () => {
    expect(parseJson("@json({ a: { b: { c: { d: string } } } })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ a: { b: { c: { d: string } } } }",
    });
  });

  it("optional fields", () => {
    expect(parseJson("@json({ name?: string, age?: number })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ name?: string, age?: number }",
    });
  });

  it("readonly fields", () => {
    expect(parseJson("@json({ readonly id: string })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ readonly id: string }",
    });
  });

  it("index signature", () => {
    expect(parseJson("@json({ [key: string]: string })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ [key: string]: string }",
    });
  });

  it("trailing comma is preserved", () => {
    expect(parseJson("@json({ a: string, b: number, })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ a: string, b: number, }",
    });
  });

  it("tight whitespace", () => {
    expect(parseJson("@json({a:string,b:number})")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{a:string,b:number}",
    });
  });
});

describe("@json — Form 3 (inline anonymous, non-object expressions)", () => {
  it("Array<T> generic", () => {
    expect(parseJson("@json(Array<string>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Array<string>",
    });
  });

  it("T[] array syntax", () => {
    expect(parseJson("@json(string[])")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "string[]",
    });
  });

  it("Array of objects", () => {
    expect(parseJson("@json(Array<{ id: string }>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Array<{ id: string }>",
    });
  });

  it("union of primitives", () => {
    expect(parseJson("@json(string | number)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "string | number",
    });
  });

  it("union with null", () => {
    expect(parseJson("@json(string | null)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "string | null",
    });
  });

  it("intersection types", () => {
    expect(parseJson("@json(A & B)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "A & B",
    });
  });

  it("tuple", () => {
    expect(parseJson("@json([string, number])")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "[string, number]",
    });
  });

  it("nested tuple", () => {
    expect(parseJson("@json([string, [number, boolean]])")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "[string, [number, boolean]]",
    });
  });

  it("Map generic with two type params", () => {
    expect(parseJson("@json(Map<string, number>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Map<string, number>",
    });
  });

  it("nested generics", () => {
    expect(parseJson("@json(Promise<Map<string, Set<number>>>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Promise<Map<string, Set<number>>>",
    });
  });

  it("function type", () => {
    expect(parseJson("@json((x: string) => number)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "(x: string) => number",
    });
  });

  it("discriminated union", () => {
    expect(parseJson('@json({ type: "a", v: string } | { type: "b", v: number })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ type: "a", v: string } | { type: "b", v: number }',
    });
  });

  it("string literal union", () => {
    expect(parseJson('@json("active" | "inactive" | "archived")')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '"active" | "inactive" | "archived"',
    });
  });

  it("template literal type", () => {
    expect(parseJson("@json(`prefix-${string}`)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "`prefix-${string}`",
    });
  });

  it("Record utility type", () => {
    expect(parseJson("@json(Record<string, unknown>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Record<string, unknown>",
    });
  });

  it("Pick utility type", () => {
    expect(parseJson('@json(Pick<User, "id" | "email">)')).toEqual({
      kind: "inline-anonymous",
      typeExpression: 'Pick<User, "id" | "email">',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 4 — inline named
// ────────────────────────────────────────────────────────────────────────────

describe("@json — Form 4 (inline named)", () => {
  it("named object literal", () => {
    expect(parseJson("@json(UserMetadata = { theme: string })")).toEqual({
      kind: "inline-named",
      typeName: "UserMetadata",
      typeExpression: "{ theme: string }",
    });
  });

  it("named complex object", () => {
    expect(
      parseJson("@json(AuditPayload = { actor: string, action: string, ts: number })"),
    ).toEqual({
      kind: "inline-named",
      typeName: "AuditPayload",
      typeExpression: "{ actor: string, action: string, ts: number }",
    });
  });

  it("named with generic expression", () => {
    expect(parseJson("@json(StringList = Array<string>)")).toEqual({
      kind: "inline-named",
      typeName: "StringList",
      typeExpression: "Array<string>",
    });
  });

  it("named with union", () => {
    expect(parseJson("@json(Status = string | number)")).toEqual({
      kind: "inline-named",
      typeName: "Status",
      typeExpression: "string | number",
    });
  });

  it("named with tuple", () => {
    expect(parseJson("@json(Coords = [number, number])")).toEqual({
      kind: "inline-named",
      typeName: "Coords",
      typeExpression: "[number, number]",
    });
  });

  it("named with function type", () => {
    expect(parseJson("@json(Handler = (x: string) => number)")).toEqual({
      kind: "inline-named",
      typeName: "Handler",
      typeExpression: "(x: string) => number",
    });
  });

  it("tight whitespace around `=`", () => {
    expect(parseJson("@json(Foo={a:string})")).toEqual({
      kind: "inline-named",
      typeName: "Foo",
      typeExpression: "{a:string}",
    });
  });

  it("extra whitespace around `=`", () => {
    expect(parseJson("@json(Foo   =   { a: string })")).toEqual({
      kind: "inline-named",
      typeName: "Foo",
      typeExpression: "{ a: string }",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Bracketed shorthand
// ────────────────────────────────────────────────────────────────────────────

describe("@json — `[TypeName]` shorthand (prisma-json-types-generator compat)", () => {
  it("PascalCase shorthand", () => {
    expect(parseJson("[UserMetadata]")).toEqual({
      kind: "bare",
      typeName: "UserMetadata",
    });
  });

  it("snake_case shorthand", () => {
    expect(parseJson("[user_metadata]")).toEqual({
      kind: "bare",
      typeName: "user_metadata",
    });
  });

  it("single-letter shorthand", () => {
    expect(parseJson("[T]")).toEqual({ kind: "bare", typeName: "T" });
  });

  it("ignores empty brackets (not a shorthand)", () => {
    const result = parseAnnotations("[]");
    expect(result.json).toBeNull();
  });

  it("ignores tuple-looking brackets (not a shorthand)", () => {
    const result = parseAnnotations("[a, b]");
    expect(result.json).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// String-literal awareness inside expressions
// ────────────────────────────────────────────────────────────────────────────

describe("@json — string literal awareness", () => {
  it("brace inside string doesn't unbalance depth", () => {
    expect(parseJson('@json({ msg: "has } brace inside" })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ msg: "has } brace inside" }',
    });
  });

  it("paren inside string doesn't unbalance depth", () => {
    expect(parseJson('@json({ msg: "has ) paren inside" })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ msg: "has ) paren inside" }',
    });
  });

  it("equals sign inside string doesn't trigger Form 4", () => {
    expect(parseJson('@json({ msg: "= sign" })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ msg: "= sign" }',
    });
  });

  it("escaped quote inside string", () => {
    expect(parseJson('@json({ msg: "she said \\"hi\\"" })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ msg: "she said \\"hi\\"" }',
    });
  });

  it("single quotes inside double-quoted string", () => {
    expect(parseJson('@json({ msg: "it\'s fine" })')).toEqual({
      kind: "inline-anonymous",
      typeExpression: '{ msg: "it\'s fine" }',
    });
  });

  it("template literal containing `=`", () => {
    expect(parseJson("@json({ kind: `a=b` })")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "{ kind: `a=b` }",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Operators that look like `=` but aren't an assignment
// ────────────────────────────────────────────────────────────────────────────

describe("@json — compound operators are not Form 4 triggers", () => {
  it("`==` does not trigger Form 4", () => {
    const result = parseJson("@json(Foo == Bar)");
    // Falls through to Form 3 (no top-level `=` found)
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("`=>` does not trigger Form 4", () => {
    // (x: string) => number — the `=>` is a function arrow
    const result = parseJson("@json(Handler = (x: string) => number)");
    expect(result).toEqual({
      kind: "inline-named",
      typeName: "Handler",
      typeExpression: "(x: string) => number",
    });
  });

  it("`!=` does not trigger Form 4", () => {
    const result = parseJson("@json(Foo != Bar)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("`<=` does not trigger Form 4", () => {
    const result = parseJson("@json(Foo <= Bar)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("`>=` does not trigger Form 4", () => {
    const result = parseJson("@json(Foo >= Bar)");
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Form 4 with `=` inside nested structures
// ────────────────────────────────────────────────────────────────────────────

describe("@json — top-level `=` detection in nested expressions", () => {
  it("ignores `=` inside braces", () => {
    // `Foo = { a = 1 }` — the inner `=` is inside braces; the outer one
    // at top level is the Form 4 separator.
    expect(parseJson("@json(Foo = { a = 1 })")).toEqual({
      kind: "inline-named",
      typeName: "Foo",
      typeExpression: "{ a = 1 }",
    });
  });

  it("ignores `=` inside parens", () => {
    expect(parseJson("@json(Foo = ((a = 1) => a))")).toEqual({
      kind: "inline-named",
      typeName: "Foo",
      typeExpression: "((a = 1) => a)",
    });
  });

  it("ignores `=` inside generic angle brackets", () => {
    // Default type parameter: `Foo<T = string>` — the inner `=` is inside `<>`.
    expect(parseJson("@json(Foo<T = string>)")).toEqual({
      kind: "inline-anonymous",
      typeExpression: "Foo<T = string>",
    });
  });

  it("Form 4 named type with default-parameter generic in expression", () => {
    expect(parseJson("@json(MyType = Foo<T = string>)")).toEqual({
      kind: "inline-named",
      typeName: "MyType",
      typeExpression: "Foo<T = string>",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Multi-line continuation
// ────────────────────────────────────────────────────────────────────────────

describe("@json — multi-line annotations", () => {
  it("joins lines when an object literal spans multiple lines", () => {
    const input = ["@json({", "  theme: string,", "  locale: string,", "})"].join("\n");
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("joins lines for a named multi-line object", () => {
    const input = ["@json(UserSettings = {", "  theme: string,", "  locale: string,", "})"].join(
      "\n",
    );
    const result = parseJson(input);
    expect(result).toMatchObject({
      kind: "inline-named",
      typeName: "UserSettings",
    });
  });

  it("multi-line discriminated union", () => {
    const input = [
      '@json({ type: "a", v: string }',
      '  | { type: "b", v: number }',
      '  | { type: "c", v: boolean })',
    ].join("\n");
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("string-literal-aware: brace inside string in multi-line doesn't unbalance", () => {
    const input = ["@json({", '  msg: "this } looks like a close",', "  ok: boolean,", "})"].join(
      "\n",
    );
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("tuple spanning lines", () => {
    const input = "@json([\n  string,\n  number,\n  boolean,\n])";
    const result = parseJson(input);
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Edge cases and graceful failure modes
// ────────────────────────────────────────────────────────────────────────────

describe("@json — edge cases", () => {
  it("empty args returns null", () => {
    expect(parseJson("@json()")).toBeNull();
  });

  it("whitespace-only args returns null", () => {
    expect(parseJson("@json(   )")).toBeNull();
  });

  it("Form 4 with empty rhs falls through to Form 3", () => {
    // `Foo =` — namePart valid but exprPart empty; should NOT match Form 4.
    // Falls through to Form 1 (fails: contains `=` and space) then Form 3.
    const result = parseJson("@json(Foo =)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("Form 4 with non-identifier name falls through to Form 3", () => {
    // `Foo.Bar = X` — name is not a simple identifier; should fall through.
    const result = parseJson("@json(Foo.Bar = X)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("non-ASCII identifiers (Unicode) fall through to Form 3 (we don't currently support them as bare names)", () => {
    // \w in JS regex is ASCII-only by default; this is a known limitation.
    const result = parseJson("@json(Πάρτι)");
    expect(result?.kind).toBe("inline-anonymous");
  });

  it("path-like expressions without `from` are inline expressions", () => {
    // `Foo "./path"` (missing `from`) falls through to Form 3.
    const result = parseJson('@json(Foo "./path")');
    expect(result?.kind).toBe("inline-anonymous");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Sanity: round-trip — parser output should be deterministic
// ────────────────────────────────────────────────────────────────────────────

describe("@json — determinism", () => {
  it("parses the same input identically across runs", () => {
    const input = "@json(Foo = { a: string, b: Array<{ c: number }> })";
    const a = parseJson(input);
    const b = parseJson(input);
    expect(a).toEqual(b);
  });

  it("trims input consistently", () => {
    const tight = parseJson("@json({a:string})");
    const padded = parseJson("@json(  {a:string}  )");
    // Padded version has stripped outer whitespace but kept inner expression
    expect(tight?.kind).toBe("inline-anonymous");
    expect(padded?.kind).toBe("inline-anonymous");
  });
});
