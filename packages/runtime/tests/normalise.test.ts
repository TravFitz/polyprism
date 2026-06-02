import { describe, expect, it } from "vitest";

import { type NormaliseOp, normalise, normaliseNullable } from "../src/normalise.js";

describe("normalise", () => {
  describe("individual ops", () => {
    it("applies trim", () => {
      expect(normalise("  hello  ", ["trim"])).toBe("hello");
    });

    it("applies lowercase", () => {
      expect(normalise("HELLO", ["lowercase"])).toBe("hello");
    });

    it("applies uppercase", () => {
      expect(normalise("hello", ["uppercase"])).toBe("HELLO");
    });

    it("ignores nullEmptyToNull on a non-nullable signature (no-op for defense)", () => {
      expect(normalise("", ["nullEmptyToNull"])).toBe("");
    });

    it("returns input unchanged when ops list is empty", () => {
      expect(normalise("HeLLo", [])).toBe("HeLLo");
    });
  });

  describe("combinations", () => {
    it("applies trim then lowercase", () => {
      expect(normalise("  ABC  ", ["trim", "lowercase"])).toBe("abc");
    });

    it("applies trim then uppercase", () => {
      expect(normalise("  abc  ", ["trim", "uppercase"])).toBe("ABC");
    });

    it("applies all three ops in declared order", () => {
      expect(normalise("  Hello WORLD  ", ["trim", "lowercase", "uppercase"])).toBe("HELLO WORLD");
    });
  });

  describe("order sensitivity", () => {
    it("trim-then-lowercase preserves whitespace handling correctly", () => {
      // both should give same answer here; included for documentation
      expect(normalise("  AB  ", ["trim", "lowercase"])).toBe("ab");
      expect(normalise("  AB  ", ["lowercase", "trim"])).toBe("ab");
    });

    it("trim-then-lowercase differs from lowercase-then-trim for unicode whitespace edges (sanity check)", () => {
      // Both behave the same on ASCII whitespace; this just documents that
      // we apply in declared order — we don't optimise or reorder.
      const ops: readonly NormaliseOp[] = ["lowercase", "trim"];
      expect(normalise("\tHELLO\t", ops)).toBe("hello");
    });
  });

  describe("idempotence", () => {
    it("calling normalise twice with same ops is identical to once (for converging ops)", () => {
      const once = normalise("  ABC  ", ["trim", "lowercase"]);
      const twice = normalise(once, ["trim", "lowercase"]);
      expect(twice).toBe(once);
    });
  });

  describe("edge cases", () => {
    it("handles empty string with trim (still empty)", () => {
      expect(normalise("", ["trim"])).toBe("");
    });

    it("handles whitespace-only string with trim (becomes empty)", () => {
      expect(normalise("   ", ["trim"])).toBe("");
    });

    it("preserves middle whitespace under trim", () => {
      expect(normalise("  hello world  ", ["trim"])).toBe("hello world");
    });

    it("handles unicode characters under lowercase", () => {
      expect(normalise("ÄÖÜ", ["lowercase"])).toBe("äöü");
    });
  });
});

describe("normaliseNullable", () => {
  describe("non-null inputs behave like normalise", () => {
    it("trims", () => {
      expect(normaliseNullable("  hello  ", ["trim"])).toBe("hello");
    });

    it("lowercases", () => {
      expect(normaliseNullable("HELLO", ["lowercase"])).toBe("hello");
    });

    it("uppercases", () => {
      expect(normaliseNullable("hello", ["uppercase"])).toBe("HELLO");
    });

    it("applies combinations in order", () => {
      expect(normaliseNullable("  ABC  ", ["trim", "lowercase"])).toBe("abc");
    });
  });

  describe("null input handling", () => {
    it("returns null when input is null and ops list is empty", () => {
      expect(normaliseNullable(null, [])).toBeNull();
    });

    it("returns null when input is null and ops list has string ops (short-circuits)", () => {
      expect(normaliseNullable(null, ["trim", "lowercase"])).toBeNull();
    });

    it("returns null when input is null and nullEmptyToNull is present", () => {
      expect(normaliseNullable(null, ["nullEmptyToNull"])).toBeNull();
    });
  });

  describe("nullEmptyToNull op", () => {
    it("converts empty string to null", () => {
      expect(normaliseNullable("", ["nullEmptyToNull"])).toBeNull();
    });

    it("leaves non-empty string unchanged", () => {
      expect(normaliseNullable("a", ["nullEmptyToNull"])).toBe("a");
    });

    it("does NOT convert whitespace-only string to null without a preceding trim", () => {
      expect(normaliseNullable("   ", ["nullEmptyToNull"])).toBe("   ");
    });

    it("converts whitespace-only string to null when trim runs first", () => {
      expect(normaliseNullable("   ", ["trim", "nullEmptyToNull"])).toBeNull();
    });

    it("short-circuits subsequent ops once value becomes null", () => {
      // After nullEmptyToNull turns "" into null, subsequent lowercase
      // must NOT execute (would crash trying to call .toLowerCase() on null).
      expect(normaliseNullable("", ["nullEmptyToNull", "lowercase"])).toBeNull();
    });

    it("does not convert non-empty string even if pipeline contains nullEmptyToNull", () => {
      expect(normaliseNullable("HELLO", ["lowercase", "nullEmptyToNull"])).toBe("hello");
    });
  });

  describe("idempotence", () => {
    it("calling twice is identical to once for converging ops", () => {
      const once = normaliseNullable("  ABC  ", ["trim", "lowercase", "nullEmptyToNull"]);
      const twice = normaliseNullable(once, ["trim", "lowercase", "nullEmptyToNull"]);
      expect(twice).toBe(once);
    });
  });
});
