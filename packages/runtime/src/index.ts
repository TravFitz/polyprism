// @polyprism/runtime — runtime helpers used by generated @polyprism/ts-domain-class output.
//
// Pure ESM, zero third-party runtime dependencies. Generated domain-class
// setters import from this package to apply @normalise / @coerce semantics on
// assignment, instead of inlining the same logic per-model.
//
// This is the one PolyPrism runtime dep. Consumers using ts-interface,
// ts-type, or ts-class never see this package — their generated code imports
// nothing from @polyprism/*.

export {
  coerceBigInt,
  coerceDate,
  coerceFloat,
  coerceInt,
} from "./coerce.js";
export type { NormaliseOp } from "./normalise.js";
export { normalise, normaliseNullable } from "./normalise.js";
