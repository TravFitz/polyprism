// @polyprism/ts-type — emits `export type X = { ... };` declarations.
// Thin wrapper around @polyprism/ts-shared's emitModels with declarationStyle="type".

import type { GeneratorContext } from "@polyprism/core";
import { emitModels } from "@polyprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "type" });
}
