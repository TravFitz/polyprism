// @polyprism/ts-domain-class — emits opinionated TypeScript domain classes:
// private fields + per-instance enumerable accessors + setters that honour
// @coerce / @normalise (default-coerce on Int/Float/Decimal/BigInt/DateTime;
// strict by default elsewhere). Plus (post-rc.1) from() and toJSON(), and
// (post-rc.2) a fluent builder.
//
// The setter pipeline routes through @polyprism/runtime helpers — the one
// PolyPrism runtime dep, only required for this pattern.
//
// Thin wrapper around @polyprism/ts-shared's emitModels with declarationStyle="domain-class".

import type { GeneratorContext } from "@polyprism/core";
import { emitModels } from "@polyprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "domain-class" });
}
