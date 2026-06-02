import { describe, expect, it } from "vitest";

import * as runtime from "../src/index.js";

describe("@polyprism/runtime public API surface", () => {
  it("re-exports every documented symbol", () => {
    // Locking this list down: any addition or removal here needs to be
    // deliberate. Generated domain-class output imports from this surface,
    // so unexpected drift breaks user code at install time.
    expect(typeof runtime.normalise).toBe("function");
    expect(typeof runtime.normaliseNullable).toBe("function");
    expect(typeof runtime.coerceInt).toBe("function");
    expect(typeof runtime.coerceFloat).toBe("function");
    expect(typeof runtime.coerceBigInt).toBe("function");
    expect(typeof runtime.coerceDate).toBe("function");
  });

  it("does not export anything other than the documented symbols", () => {
    const expected = new Set([
      "normalise",
      "normaliseNullable",
      "coerceInt",
      "coerceFloat",
      "coerceBigInt",
      "coerceDate",
    ]);
    const actual = new Set(Object.keys(runtime));
    expect(actual).toEqual(expected);
  });

  it("end-to-end smoke: normalise + coerce in a one-line domain-class-like setter pipeline", () => {
    // Simulating: setter receiving "  5  " for an @normalise(trim) @coerce(int) field.
    const raw = "  5  ";
    const normalised = runtime.normalise(raw, ["trim"]);
    const coerced = runtime.coerceInt(normalised, "Test.field");
    expect(coerced).toBe(5);
  });
});
