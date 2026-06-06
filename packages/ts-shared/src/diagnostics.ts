// Diagnostic types live in `@polyprism/core` so every emitter family
// (ts-shared, php-shared, and future targets) shares one surface. This
// module re-exports them so existing imports of `@polyprism/ts-shared`'s
// Diagnostic continue to resolve without callers having to switch package.
//
// See `@polyprism/core`'s `diagnostics/index.ts` for the full type docs.

export { type Diagnostic, defaultReportDiagnostic } from "@polyprism/core";
