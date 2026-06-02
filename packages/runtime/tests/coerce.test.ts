import { describe, expect, it } from "vitest";

import { coerceBigInt, coerceDate, coerceFloat, coerceInt } from "../src/coerce.js";

describe("coerceInt", () => {
  it("returns the input unchanged when already a finite number", () => {
    expect(coerceInt(5, "T.f")).toBe(5);
    expect(coerceInt(0, "T.f")).toBe(0);
    expect(coerceInt(-42, "T.f")).toBe(-42);
  });

  it("parses a decimal-free numeric string", () => {
    expect(coerceInt("5", "T.f")).toBe(5);
    expect(coerceInt("-42", "T.f")).toBe(-42);
    expect(coerceInt("0", "T.f")).toBe(0);
  });

  it("throws on fractional string input — 'int means int', not 'silently truncate'", () => {
    expect(() => coerceInt("5.7", "T.f")).toThrowError(/Cannot coerce "5.7" to int/);
    expect(() => coerceInt("5.5", "T.f")).toThrowError(/Cannot coerce "5.5" to int/);
  });

  it("throws on fractional number input — symmetric with the string path", () => {
    expect(() => coerceInt(5.7, "User.points")).toThrowError(
      /Cannot coerce 5.7 to int for User\.points/,
    );
    expect(() => coerceInt(1.99, "T.f")).toThrowError(/Cannot coerce 1.99 to int/);
  });

  it("accepts integer-valued strings with trailing-zero decimals (Number('1.0') === 1)", () => {
    // "1.0" parses to the integer 1 via Number(); Number.isInteger(1) is true.
    expect(coerceInt("1.0", "T.f")).toBe(1);
    expect(coerceInt("42.0", "T.f")).toBe(42);
  });

  it("tolerates leading whitespace in strings (Number() skips it)", () => {
    expect(coerceInt("  5", "T.f")).toBe(5);
  });

  it("throws TypeError with field path when input is non-numeric string", () => {
    expect(() => coerceInt("abc", "User.points")).toThrowError(
      /Cannot coerce "abc" to int for User\.points/,
    );
  });

  it("throws TypeError when input is empty string", () => {
    expect(() => coerceInt("", "T.f")).toThrowError(/Cannot coerce "" to int for T\.f/);
  });

  it("throws TypeError when input is whitespace-only string", () => {
    expect(() => coerceInt("   ", "T.f")).toThrowError(/Cannot coerce " {3}" to int/);
  });

  it("throws TypeError when input is NaN", () => {
    expect(() => coerceInt(Number.NaN, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws TypeError when input is Infinity", () => {
    expect(() => coerceInt(Number.POSITIVE_INFINITY, "T.f")).toThrowError(/Cannot coerce/);
    expect(() => coerceInt(Number.NEGATIVE_INFINITY, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("accepts MAX_SAFE_INTEGER and MIN_SAFE_INTEGER (both finite)", () => {
    expect(coerceInt(Number.MAX_SAFE_INTEGER, "T.f")).toBe(Number.MAX_SAFE_INTEGER);
    expect(coerceInt(Number.MIN_SAFE_INTEGER, "T.f")).toBe(Number.MIN_SAFE_INTEGER);
  });

  it("accepts -0 (Number.isFinite returns true, does not throw)", () => {
    // -0 is finite; coerceInt should pass it through. We don't assert
    // exact -0 vs +0 — the contract is "finite number through; throws
    // otherwise", which is what we check.
    expect(() => coerceInt(-0, "T.f")).not.toThrow();
    expect(Number.isFinite(coerceInt(-0, "T.f"))).toBe(true);
  });
});

describe("coerceFloat", () => {
  it("returns the input unchanged when already a finite number", () => {
    expect(coerceFloat(5.5, "T.f")).toBe(5.5);
    expect(coerceFloat(0, "T.f")).toBe(0);
    expect(coerceFloat(-3.14, "T.f")).toBe(-3.14);
  });

  it("parses decimal strings", () => {
    expect(coerceFloat("5.5", "T.f")).toBe(5.5);
    expect(coerceFloat("3.14", "T.f")).toBe(3.14);
    expect(coerceFloat("-0.1", "T.f")).toBe(-0.1);
  });

  it("parses integer strings as floats", () => {
    expect(coerceFloat("5", "T.f")).toBe(5);
  });

  it("parses scientific notation", () => {
    expect(coerceFloat("1.5e3", "T.f")).toBe(1500);
    expect(coerceFloat("2.5e-2", "T.f")).toBe(0.025);
  });

  it("throws TypeError with field path on non-numeric string", () => {
    expect(() => coerceFloat("abc", "Order.amount")).toThrowError(
      /Cannot coerce "abc" to float for Order\.amount/,
    );
  });

  it("throws TypeError when input is NaN", () => {
    expect(() => coerceFloat(Number.NaN, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws TypeError when input is Infinity", () => {
    expect(() => coerceFloat(Number.POSITIVE_INFINITY, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws on garbage-tail strings — Number() is strict, no parseFloat-style prefix parsing", () => {
    // The whole string must be a valid number. "5.5abc" silently became 5.5
    // before the Number() switch; that was a contract gap on the Float setter.
    expect(() => coerceFloat("5.5abc", "Order.exchangeRate")).toThrowError(
      /Cannot coerce "5.5abc" to float for Order\.exchangeRate/,
    );
    expect(() => coerceFloat("3.14garbage", "T.f")).toThrowError(/Cannot coerce/);
    expect(() => coerceFloat("5abc", "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws on empty / whitespace-only strings (Number('') is 0, semantically wrong)", () => {
    expect(() => coerceFloat("", "T.f")).toThrowError(/Cannot coerce "" to float/);
    expect(() => coerceFloat("   ", "T.f")).toThrowError(/Cannot coerce " {3}" to float/);
  });
});

describe("coerceBigInt", () => {
  it("returns the input unchanged when already a bigint", () => {
    expect(coerceBigInt(123n, "T.f")).toBe(123n);
    expect(coerceBigInt(0n, "T.f")).toBe(0n);
  });

  it("converts integer numbers to bigint", () => {
    expect(coerceBigInt(5, "T.f")).toBe(5n);
    expect(coerceBigInt(0, "T.f")).toBe(0n);
  });

  it("parses integer strings", () => {
    expect(coerceBigInt("100", "T.f")).toBe(100n);
    expect(coerceBigInt("-42", "T.f")).toBe(-42n);
  });

  it("parses very large integer strings beyond Number.MAX_SAFE_INTEGER", () => {
    expect(coerceBigInt("9007199254740993", "T.f")).toBe(9007199254740993n);
  });

  it("throws TypeError with field path on fractional string (BigInt rejects)", () => {
    expect(() => coerceBigInt("1.5", "Counter.value")).toThrowError(
      /Cannot coerce "1.5" to bigint for Counter\.value/,
    );
  });

  it("throws TypeError on non-numeric string", () => {
    expect(() => coerceBigInt("abc", "T.f")).toThrowError(/Cannot coerce "abc" to bigint/);
  });

  it("throws TypeError on fractional number (BigInt rejects)", () => {
    expect(() => coerceBigInt(1.5, "T.f")).toThrowError(/Cannot coerce 1.5 to bigint/);
  });

  it("throws TypeError on NaN", () => {
    expect(() => coerceBigInt(Number.NaN, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws TypeError on Infinity", () => {
    expect(() => coerceBigInt(Number.POSITIVE_INFINITY, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("throws on empty / whitespace-only strings (BigInt('') is 0n natively, semantically wrong)", () => {
    // Without the guard, `BigInt("")` returns `0n` — an empty-string id from
    // a boundary payload would silently become a valid-looking zero.
    expect(() => coerceBigInt("", "Order.id")).toThrowError(
      /Cannot coerce "" to bigint for Order\.id/,
    );
    expect(() => coerceBigInt("   ", "T.f")).toThrowError(/Cannot coerce " {3}" to bigint/);
  });
});

describe("coerceDate", () => {
  it("returns the input unchanged when already a Date", () => {
    const d = new Date("2026-06-02T00:00:00Z");
    expect(coerceDate(d, "T.f")).toBe(d);
  });

  it("parses ISO 8601 strings", () => {
    const result = coerceDate("2026-06-02T00:00:00Z", "T.f");
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("parses simple date strings", () => {
    const result = coerceDate("2026-06-02", "T.f");
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it("parses epoch milliseconds as a number", () => {
    const result = coerceDate(1717286400000, "T.f");
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(1717286400000);
  });

  it("accepts 0 as the Unix epoch", () => {
    const result = coerceDate(0, "T.f");
    expect(result.getTime()).toBe(0);
  });

  it("throws TypeError with field path on invalid date string", () => {
    expect(() => coerceDate("not-a-date", "User.createdAt")).toThrowError(
      /Cannot coerce "not-a-date" to Date for User\.createdAt/,
    );
  });

  it("throws TypeError on empty string", () => {
    expect(() => coerceDate("", "T.f")).toThrowError(/Cannot coerce "" to Date/);
  });

  it("throws TypeError on NaN", () => {
    expect(() => coerceDate(Number.NaN, "T.f")).toThrowError(/Cannot coerce/);
  });

  it("rejects an existing Invalid Date instance (defensive)", () => {
    const invalid = new Date("not-a-date");
    expect(Number.isNaN(invalid.getTime())).toBe(true);
    expect(() => coerceDate(invalid, "T.f")).toThrowError(/Cannot coerce/);
  });
});
