// @polyprism/php-domain-class — emits PHP 8.4 domain classes with property
// hooks. `@coerce` / `@normalise` / `@noCoerce` are honoured via the
// `polyprism/runtime` Composer package (a one-time `composer require` on the
// consumer side). Thin wrapper around @polyprism/php-shared's emitPhpModels
// with declarationStyle="domain-class".

import type { GeneratorContext } from "@polyprism/core";
import { emitPhpModels } from "@polyprism/php-shared";

export async function emit(ctx: GeneratorContext): Promise<void> {
  await emitPhpModels(ctx, { declarationStyle: "domain-class" });
}
