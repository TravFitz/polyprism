// @omniprism/ts-class — emits `export class X { ... }` declarations with
// public fields. Plain classes, no decorators (that's ts-domain-class, post v0.1).
// Thin wrapper around @omniprism/ts-shared's emitModels with declarationStyle="class".

import type { GeneratorContext } from "@omniprism/core";
import { emitModels } from "@omniprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "class" });
}
