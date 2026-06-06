// Cross-cutting diagnostic surface for emit-time issues.
//
// Originally lived as identical copies in `@polyprism/ts-shared` and
// `@polyprism/php-shared`. Hoisted here in v0.2.1 so a single Diagnostic
// shape and reporter are reused by every emitter family — keeps the
// reporting story uniform for downstream consumers and removes the drift
// risk of two-copy maintenance.
//
// What this surface captures:
//   1. AnnotationSet.parseIssues — recorded by the core annotation parser
//      when annotations are malformed (wrong arity, unknown form).
//   2. Emit-time validation issues — emitted by language-specific renderers
//      (e.g. `@coerce` on a Boolean, `@noCoerce` on a strict-by-default
//      scalar, unsupported `@json` forms).
//
// The emit pipeline either:
//   - hands diagnostics to a caller-supplied `onDiagnostic` callback (tests
//     do this), or
//   - prints them to stderr (the normal Prisma-generator run) and throws
//     at the end if any were error-severity.
//
// What this DOESN'T do (yet): include schema source line numbers. The IR
// doesn't carry source positions because DMMF doesn't expose them, and
// the cost of bolting on a side-channel Prisma schema parser isn't
// justified before a real user asks for it. Diagnostics quote the
// model/field path (e.g. "User.email") instead, which is enough to locate
// the issue in a human's schema file without grep.

export interface Diagnostic {
  readonly severity: "error" | "warning";
  /**
   * Where the issue applies. Conventional shapes:
   *   - `"User"`           — issue on a model
   *   - `"User.email"`     — issue on a model field
   *   - `"Role"`           — issue on an enum
   *   - `"Role.ADMIN"`     — issue on an enum value
   *   - `"JsonTypes.X"`    — issue on a generated JSON value class
   */
  readonly context: string;
  readonly message: string;
}

/** Default reporter: writes warnings and errors to stderr with a prefix tag. */
export function defaultReportDiagnostic(d: Diagnostic): void {
  const prefix = d.severity === "error" ? "[error]" : "[warn] ";
  // Prisma's JSON-RPC for generators is also on stderr (see
  // `core/src/generator/json-rpc.ts` — "expects newline-delimited responses
  // on STDERR"). The protocol lines are pure JSON; our diagnostic lines
  // start with "PolyPrism " and contain a colon, so they don't parse as
  // JSON and the Prisma CLI surfaces them as plain output. The same channel
  // is already used for parse-error reporting in json-rpc.ts, so this
  // doesn't open a new failure mode.
  console.error(`PolyPrism ${prefix} ${d.context}: ${d.message}`);
}
