// Diagnostic surface for PHP emit-time issues.
//
// Mirror of the ts-shared/src/diagnostics.ts shape. Kept local to php-shared
// for v0 — both copies are tiny and the duplication keeps the PHP package
// independent of the TS family at install time. A future cleanup will hoist
// the type into @polyprism/core once a third family arrives (Go, Rust, ...)
// and the duplication is no longer hypothetical.
//
// Two kinds of issues funnel through here:
//   1. AnnotationSet.parseIssues recorded by the core annotation parser.
//   2. PHP-emitter validations (e.g. unsupported @json forms, unhandled
//      default-value shapes) that this package raises while rendering.

export interface Diagnostic {
  readonly severity: "error" | "warning";
  /**
   * Where the issue applies. Conventional shapes:
   *   - `"User"`       — model
   *   - `"User.email"` — model field
   *   - `"Role"`       — enum
   *   - `"Role.ADMIN"` — enum value
   */
  readonly context: string;
  readonly message: string;
}

/** Default reporter: writes warnings and errors to stderr with a prefix tag. */
export function defaultReportDiagnostic(d: Diagnostic): void {
  const prefix = d.severity === "error" ? "[error]" : "[warn] ";
  // Prisma's JSON-RPC for generators is also on stderr, but its frames are
  // pure JSON; ours start with "PolyPrism " and contain a colon, so the
  // two stream types don't tangle when the Prisma CLI surfaces them.
  console.error(`PolyPrism ${prefix} ${d.context}: ${d.message}`);
}
