// @polyprism/php-class — emits `final class X { ... }` PHP 8.1+ classes
// with public typed properties via constructor property promotion.
// Thin wrapper around @polyprism/php-shared's emitPhpModels with
// declarationStyle="class".

import type { GeneratorContext } from "@polyprism/core";
import { emitPhpModels } from "@polyprism/php-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitPhpModels(ctx, { declarationStyle: "class" });
}
