// @polyprism/php-readonly — emits `final readonly class X { ... }` PHP 8.2+
// immutable value objects with constructor property promotion. Thin wrapper
// around @polyprism/php-shared's emitPhpModels with declarationStyle="readonly".

import type { GeneratorContext } from "@polyprism/core";
import { emitPhpModels } from "@polyprism/php-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitPhpModels(ctx, { declarationStyle: "readonly" });
}
