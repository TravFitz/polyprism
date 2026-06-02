import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";

describe("parseAnnotations", () => {
  it("returns empty set for null input", () => {
    const result = parseAnnotations(null);
    expect(result.hide).toBe(false);
    expect(result.deprecated).toBeNull();
    expect(result.json).toBeNull();
    expect(result.documentation).toBeNull();
    expect(result.rawAnnotations).toEqual([]);
  });

  it("parses @hide", () => {
    const result = parseAnnotations("@hide");
    expect(result.hide).toBe(true);
    expect(result.rawAnnotations).toEqual(["@hide"]);
    expect(result.documentation).toBeNull();
  });

  it("parses @deprecated with no reason", () => {
    const result = parseAnnotations("@deprecated");
    expect(result.deprecated).toEqual({ reason: null });
  });

  it("parses @deprecated with quoted reason", () => {
    const result = parseAnnotations('@deprecated("use displayName instead")');
    expect(result.deprecated).toEqual({ reason: "use displayName instead" });
  });

  it("parses @name", () => {
    const result = parseAnnotations("@name(BulkJobStatus)");
    expect(result.name).toBe("BulkJobStatus");
  });

  it("parses @normalise with multiple ops", () => {
    const result = parseAnnotations("@normalise(trim, lowercase, nullEmptyToNull)");
    expect(result.normalise).toEqual(["trim", "lowercase", "nullEmptyToNull"]);
  });

  it("accepts @normalize as a spelling alias", () => {
    const result = parseAnnotations("@normalize(trim)");
    expect(result.normalise).toEqual(["trim"]);
  });

  it("rejects unknown @normalise ops silently", () => {
    const result = parseAnnotations("@normalise(trim, BOGUS)");
    expect(result.normalise).toEqual(["trim"]);
  });

  it("parses @coerce", () => {
    const result = parseAnnotations("@coerce(date)");
    expect(result.coerce).toBe("date");
  });

  it("rejects unknown @coerce target silently", () => {
    const result = parseAnnotations("@coerce(weirdtype)");
    expect(result.coerce).toBeNull();
  });

  describe("regression: apostrophes in prose don't swallow trailing annotations", () => {
    it("recognises @coerce(int) on a later line even when an earlier doc line has an apostrophe", () => {
      const doc = "Shopify's API returns this column as a stringified int.\n@coerce(int)";
      const result = parseAnnotations(doc);
      expect(result.coerce).toBe("int");
      expect(result.documentation).toBe("Shopify's API returns this column as a stringified int.");
    });

    it("recognises @deprecated on a later line when prose has an apostrophe", () => {
      const doc = "The user's preferred name display.\n@deprecated";
      const result = parseAnnotations(doc);
      expect(result.deprecated).toEqual({ reason: null });
      expect(result.documentation).toBe("The user's preferred name display.");
    });

    it("still respects quotes inside annotation args (string tracking when in parens)", () => {
      // The whole point of the original string-tracking was that a `)` inside
      // a quoted annotation arg shouldn't close the paren prematurely.
      const result = parseAnnotations('@deprecated("use renderUserName(ctx)")');
      expect(result.deprecated).toEqual({ reason: "use renderUserName(ctx)" });
    });
  });

  describe("@noCoerce", () => {
    it("parses @noCoerce (no args)", () => {
      const result = parseAnnotations("@noCoerce");
      expect(result.noCoerce).toBe(true);
    });

    it("parses @noCoerce() (empty parens)", () => {
      const result = parseAnnotations("@noCoerce()");
      expect(result.noCoerce).toBe(true);
    });

    it("defaults noCoerce to false when annotation is absent", () => {
      const result = parseAnnotations("@hide");
      expect(result.noCoerce).toBe(false);
    });

    it("defaults noCoerce to false on completely empty input", () => {
      const result = parseAnnotations(null);
      expect(result.noCoerce).toBe(false);
    });

    it("preserves raw annotation text for debugging", () => {
      const result = parseAnnotations("@noCoerce");
      expect(result.rawAnnotations).toContain("@noCoerce");
    });

    it("can coexist with other annotations", () => {
      const result = parseAnnotations("@noCoerce\n@deprecated");
      expect(result.noCoerce).toBe(true);
      expect(result.deprecated).toEqual({ reason: null });
    });

    it("warns (but still applies) when @noCoerce is called with arguments", () => {
      const result = parseAnnotations("@noCoerce(int)");
      expect(result.noCoerce).toBe(true);
      expect(result.parseIssues).toHaveLength(1);
      expect(result.parseIssues[0]?.severity).toBe("warning");
      expect(result.parseIssues[0]?.message).toMatch(/@noCoerce takes no arguments/);
      expect(result.parseIssues[0]?.message).toMatch(/int/);
    });

    it("does NOT warn for bare @noCoerce or @noCoerce()", () => {
      expect(parseAnnotations("@noCoerce").parseIssues).toHaveLength(0);
      expect(parseAnnotations("@noCoerce()").parseIssues).toHaveLength(0);
      expect(parseAnnotations("@noCoerce(   )").parseIssues).toHaveLength(0);
    });
  });

  describe("@json forms", () => {
    it("form 1: bare type name", () => {
      const result = parseAnnotations("@json(UserMetadata)");
      expect(result.json).toEqual({ kind: "bare", typeName: "UserMetadata" });
    });

    it("form 2: with import path", () => {
      const result = parseAnnotations('@json(BillingAddress from "./types/billing")');
      expect(result.json).toEqual({
        kind: "with-path",
        typeName: "BillingAddress",
        importPath: "./types/billing",
      });
    });

    it("form 3: inline anonymous", () => {
      const result = parseAnnotations("@json({ theme: string, locale: string })");
      expect(result.json).toEqual({
        kind: "inline-anonymous",
        typeExpression: "{ theme: string, locale: string }",
      });
    });

    it("form 4: inline named", () => {
      const result = parseAnnotations(
        "@json(AuditPayload = { actor: string, action: string, ts: number })",
      );
      expect(result.json).toEqual({
        kind: "inline-named",
        typeName: "AuditPayload",
        typeExpression: "{ actor: string, action: string, ts: number }",
      });
    });

    it("[TypeName] shorthand (prisma-json-types-generator compat)", () => {
      const result = parseAnnotations("[LegacyMetadata]");
      expect(result.json).toEqual({ kind: "bare", typeName: "LegacyMetadata" });
    });
  });

  describe("@type", () => {
    it("bare", () => {
      const result = parseAnnotations("@type(BrandedString)");
      expect(result.type).toEqual({ typeName: "BrandedString", importPath: null });
    });

    it("with import path", () => {
      const result = parseAnnotations('@type(EmailAddress from "./brand")');
      expect(result.type).toEqual({ typeName: "EmailAddress", importPath: "./brand" });
    });
  });

  describe("documentation preservation", () => {
    it("preserves non-annotation lines", () => {
      const result = parseAnnotations("This is a user-facing field.\n@hide");
      expect(result.hide).toBe(true);
      expect(result.documentation).toBe("This is a user-facing field.");
    });

    it("returns null documentation when only annotations", () => {
      const result = parseAnnotations("@hide\n@deprecated");
      expect(result.hide).toBe(true);
      expect(result.deprecated).toEqual({ reason: null });
      expect(result.documentation).toBeNull();
    });
  });

  describe("multi-line annotations", () => {
    it("joins continuation lines for unclosed parens", () => {
      const doc = "@json({\n  theme: string,\n  locale: string,\n})";
      const result = parseAnnotations(doc);
      expect(result.json?.kind).toBe("inline-anonymous");
    });

    it("respects string literals during depth tracking", () => {
      const result = parseAnnotations('@deprecated("foo ) bar")');
      expect(result.deprecated).toEqual({ reason: "foo ) bar" });
    });
  });

  it("records unknown annotations in rawAnnotations but doesn't fail", () => {
    const result = parseAnnotations("@unknownAnnotation(some, args)");
    expect(result.rawAnnotations).toEqual(["@unknownAnnotation(some, args)"]);
    expect(result.hide).toBe(false);
  });

  it("captures multiple annotations on the same node", () => {
    const result = parseAnnotations(
      ['@deprecated("legacy")', "@normalise(trim, lowercase)", "@hide"].join("\n"),
    );
    expect(result.deprecated).toEqual({ reason: "legacy" });
    expect(result.normalise).toEqual(["trim", "lowercase"]);
    expect(result.hide).toBe(true);
  });
});
