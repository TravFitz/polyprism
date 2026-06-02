// String-normalisation primitives used by domain-class setters.
//
// The IR's `AnnotationSet.normalise` is a `readonly NormaliseOp[]` — an
// ordered list. `normalise` applies each op in declared order. Order matters:
// `["trim", "lowercase"]` and `["lowercase", "trim"]` are not generally
// equivalent for inputs with leading/trailing whitespace mixed with
// upper-case (in practice, the user picks the order they want).

export type NormaliseOp = "trim" | "lowercase" | "uppercase" | "nullEmptyToNull";

/**
 * Apply normalise ops in order to a non-nullable string field's input.
 *
 * `nullEmptyToNull` is silently ignored here — it's only meaningful on
 * nullable fields, and the emit-time validator rejects it on non-nullable
 * fields before we ever reach this runtime path. The runtime treats it as a
 * no-op for defensive belt-and-braces (an emitter bug shouldn't crash a
 * production app).
 */
export function normalise(value: string, ops: readonly NormaliseOp[]): string {
  let next = value;
  for (const op of ops) {
    if (op === "trim") next = next.trim();
    else if (op === "lowercase") next = next.toLowerCase();
    else if (op === "uppercase") next = next.toUpperCase();
    // nullEmptyToNull intentionally a no-op here; see fn jsdoc.
  }
  return next;
}

/**
 * Apply normalise ops to a nullable string field's input.
 *
 * The `nullEmptyToNull` op only fires here, since the result type widens to
 * `string | null`. Once the value becomes `null`, subsequent ops are
 * short-circuited (you can't `.trim()` null).
 */
export function normaliseNullable(
  value: string | null,
  ops: readonly NormaliseOp[],
): string | null {
  let next: string | null = value;
  for (const op of ops) {
    if (next === null) break;
    if (op === "trim") next = next.trim();
    else if (op === "lowercase") next = next.toLowerCase();
    else if (op === "uppercase") next = next.toUpperCase();
    else if (op === "nullEmptyToNull" && next === "") next = null;
  }
  return next;
}
