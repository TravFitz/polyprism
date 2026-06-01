// @omniprism/ts-interface — emits `export interface X { ... }` declarations.
// Thin wrapper around @omniprism/ts-shared's emitModels with declarationStyle="interface".

import type { GeneratorContext } from "@omniprism/core";
import { emitModels } from "@omniprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "interface" });
}
