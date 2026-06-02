// Coercion primitives used by domain-class setters for default-coerce types.
//
// Every coerce* function:
//   - accepts a widened input type (e.g. `number | string` for Int)
//   - returns the canonical TS type (`number`, `bigint`, `Date`)
//   - throws TypeError with the field path in the message on invalid input
//
// The field path is passed in by the generated setter so error messages
// pinpoint exactly where the coercion failed:
//
//     TypeError: Cannot coerce "abc" to int for User.points
//
// Decimal coercion is NOT in this file — the generated model already imports
// Decimal from @prisma/client/runtime/library, so its one-line coercion
// (`v instanceof Decimal ? v : new Decimal(v)`) is inlined per-model. This
// keeps @polyprism/runtime free of any Prisma dependency.

/**
 * Coerce `number | string` → integer `number`. Throws on non-finite OR
 * fractional results.
 *
 * "Int" means int — a fractional input (whether `1.5` the number or `"1.5"`
 * the string) is a caller bug, not data to silently truncate. We reject both
 * paths symmetrically so the contract reads the same regardless of input
 * shape. (Earlier behaviour silently truncated string fractions via parseInt
 * but passed through number fractions untouched — a real contract gap that
 * stored `1.99` in a `#field: number` slot tied to a Prisma `Int` column.)
 */
export function coerceInt(value: number | string, fieldPath: string): number {
  // `Number("")` and `Number("   ")` both return 0, which `Number.isInteger`
  // happily accepts — but an empty/whitespace string is semantically not an
  // integer, it's just empty. Reject explicitly so the caller sees the error.
  if (typeof value === "string" && value.trim() === "") {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to int for ${fieldPath}`);
  }
  const next = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(next) || !Number.isInteger(next)) {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to int for ${fieldPath}`);
  }
  return next;
}

/**
 * Coerce `number | string` → floating-point `number`. Throws on non-finite
 * results AND on strings that don't fully match a numeric shape.
 *
 * We use `Number()` (strict) instead of `Number.parseFloat()` (lenient prefix
 * parser) because parseFloat silently accepts garbage tails: `parseFloat
 * ("5.5abc")` returns `5.5`. For a setter accepting `"amount" → Float`, that
 * means a malformed boundary payload stores partial data instead of throwing.
 * `Number("5.5abc")` returns `NaN`, which our isFinite check rejects. The
 * empty-string guard mirrors coerceInt's: `Number("")` returns `0`, which is
 * "finite" but semantically wrong for an empty input.
 */
export function coerceFloat(value: number | string, fieldPath: string): number {
  if (typeof value === "string" && value.trim() === "") {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to float for ${fieldPath}`);
  }
  const next = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(next)) {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to float for ${fieldPath}`);
  }
  return next;
}

/**
 * Coerce `bigint | number | string` → `bigint`.
 *
 * `BigInt()` itself throws SyntaxError on non-integer strings (`"1.5"`) and
 * RangeError on non-integer numbers. We rewrap as TypeError with the field
 * path so callers don't have to discriminate between three error types.
 *
 * The empty/whitespace-string guard exists because `BigInt("")` and
 * `BigInt("   ")` both return `0n` (spec behaviour, not a bug in BigInt
 * itself). That would silently stamp an empty-string id from a boundary
 * payload as a valid zero — worse failure mode than throwing.
 */
export function coerceBigInt(value: bigint | number | string, fieldPath: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && value.trim() === "") {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to bigint for ${fieldPath}`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to bigint for ${fieldPath}`);
  }
}

/**
 * Coerce `Date | string | number` → `Date`.
 *
 * `new Date("not-a-date")` succeeds but produces an Invalid Date whose
 * `.getTime()` returns NaN — we detect that and throw instead of silently
 * propagating a poisoned value.
 */
export function coerceDate(value: Date | string | number, fieldPath: string): Date {
  const next = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(next.getTime())) {
    throw new TypeError(`Cannot coerce ${JSON.stringify(value)} to Date for ${fieldPath}`);
  }
  return next;
}
