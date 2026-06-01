import { describe, expect, it } from "vitest";

import { prettyFormatType } from "../src/emitter/format-type.js";

describe("prettyFormatType — basic shapes", () => {
  it("empty object stays on one line", () => {
    expect(prettyFormatType("{}")).toBe("{}");
  });

  it("single-property object stays on one line", () => {
    expect(prettyFormatType("{ a: string }")).toBe("{ a: string }");
  });

  it("multi-property object breaks onto lines", () => {
    expect(prettyFormatType("{ a: string, b: number }")).toMatchInlineSnapshot(`
      "{
        a: string;
        b: number;
      }"
    `);
  });

  it("three-property object", () => {
    expect(prettyFormatType("{ a: string, b: number, c: boolean }")).toMatchInlineSnapshot(`
      "{
        a: string;
        b: number;
        c: boolean;
      }"
    `);
  });

  it("normalises separator to semicolons in multi-line output", () => {
    expect(prettyFormatType("{ a: string; b: number }")).toMatchInlineSnapshot(`
      "{
        a: string;
        b: number;
      }"
    `);
  });
});

describe("prettyFormatType — nested objects", () => {
  it("nested multi-property objects indent correctly", () => {
    const input = "{ user: { name: string, age: number }, active: boolean }";
    expect(prettyFormatType(input)).toMatchInlineSnapshot(`
      "{
        user: {
          name: string;
          age: number;
        };
        active: boolean;
      }"
    `);
  });

  it("nested single-property stays inline", () => {
    expect(prettyFormatType("{ wrapper: { inner: string } }")).toMatchInlineSnapshot(`
      "{ wrapper: { inner: string } }"
    `);
  });

  it("deeply nested 4 levels", () => {
    const input = "{ a: { b: { c: { d: string, e: number } } } }";
    expect(prettyFormatType(input)).toMatchInlineSnapshot(`
      "{ a: { b: { c: {
        d: string;
        e: number;
      } } } }"
    `);
  });
});

describe("prettyFormatType — non-object expressions left intact", () => {
  it("tuple", () => {
    expect(prettyFormatType("[string, number]")).toBe("[string, number]");
  });

  it("generic", () => {
    expect(prettyFormatType("Array<string>")).toBe("Array<string>");
  });

  it("union", () => {
    expect(prettyFormatType("string | number | null")).toBe("string | number | null");
  });

  it("intersection", () => {
    expect(prettyFormatType("A & B & C")).toBe("A & B & C");
  });

  it("function type", () => {
    expect(prettyFormatType("(x: string) => number")).toBe("(x: string) => number");
  });

  it("template literal type", () => {
    expect(prettyFormatType("`prefix-${string}`")).toBe("`prefix-${string}`");
  });
});

describe("prettyFormatType — strings respected at depth", () => {
  it("brace inside string doesn't trigger formatting", () => {
    expect(prettyFormatType('{ msg: "has } close brace" }')).toBe('{ msg: "has } close brace" }');
  });

  it("comma inside string doesn't split", () => {
    expect(prettyFormatType('{ msg: "a, b, c" }')).toBe('{ msg: "a, b, c" }');
  });

  it("strings with escape sequences preserved", () => {
    expect(prettyFormatType('{ msg: "she said \\"hi\\"" }')).toBe('{ msg: "she said \\"hi\\"" }');
  });

  it("template literal containing structural chars", () => {
    expect(prettyFormatType("{ kind: `a, b, { c }` }")).toBe("{ kind: `a, b, { c }` }");
  });
});

describe("prettyFormatType — mixed and complex", () => {
  it("object containing tuple stays nice", () => {
    expect(prettyFormatType("{ coords: [number, number], label: string }")).toMatchInlineSnapshot(`
      "{
        coords: [number, number];
        label: string;
      }"
    `);
  });

  it("object containing generic stays nice", () => {
    expect(prettyFormatType("{ items: Array<string>, count: number }")).toMatchInlineSnapshot(`
      "{
        items: Array<string>;
        count: number;
      }"
    `);
  });

  it("the realistic OrderMetadata shape", () => {
    const input =
      "{ source: string, campaign: string, attribution: { utm_source: string, utm_medium: string, utm_campaign?: string } }";
    expect(prettyFormatType(input)).toMatchInlineSnapshot(`
      "{
        source: string;
        campaign: string;
        attribution: {
          utm_source: string;
          utm_medium: string;
          utm_campaign?: string;
        };
      }"
    `);
  });
});

describe("prettyFormatType — edge cases", () => {
  it("trailing comma is dropped (not re-emitted as orphan separator)", () => {
    expect(prettyFormatType("{ a: string, b: number, }")).toMatchInlineSnapshot(`
      "{
        a: string;
        b: number;
      }"
    `);
  });

  it("idempotent: formatting formatted output yields the same string", () => {
    const input = "{ a: string, b: { c: number, d: boolean } }";
    const once = prettyFormatType(input);
    const twice = prettyFormatType(once);
    expect(twice).toBe(once);
  });
});
