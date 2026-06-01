// @polyprism/ts-interface — emits `export interface X { ... }` declarations.
// Thin wrapper around @polyprism/ts-shared's emitModels with declarationStyle="interface".

import type { GeneratorContext } from "@polyprism/core";
import { emitModels } from "@polyprism/ts-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitModels(ctx, { declarationStyle: "interface" });
}
