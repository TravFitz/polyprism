// @omniprism/ts-type — emits `export type X = { ... };` declarations.
// Thin wrapper around @omniprism/ts-shared's emitModels with declarationStyle="type".

import type { GeneratorContext } from "@omniprism/core";
import { emitModels } from "@omniprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "type" });
}
