// Diagnostic surface for emit-time issues.
//
// Two kinds of issues used to disappear:
//   1. AnnotationSet.parseIssues — recorded by the parser when annotations
//      are malformed (wrong arity, unknown form, etc), then never read.
//   2. RenderDomainClassResult.issues — emitted by coerce-rules.ts when
//      domain-class encounters a contradiction (@coerce on a Boolean,
//      @noCoerce on a strict-by-default type, etc), then dropped at the
//      old render-model.ts dispatch site for string-output compatibility.
//
// Both are now funnelled through this module. The emit pipeline either:
//   - hands diagnostics to a caller-supplied onDiagnostic callback (tests
//     do this), or
//   - prints them to stderr (the normal Prisma-generator run) and throws
//     at the end if any were error-severity.
//
// What this DOESN'T do (yet): include schema source line numbers. The IR
// doesn't carry source positions because DMMF doesn't expose them, and
// the cost of bolting on a side-channel Prisma schema parser isn't justified
// before a real user asks for it. Diagnostics quote the model/field path
// (e.g. "User.email") instead, which is enough to locate the issue in a
// human's schema file without grep.

export interface Diagnostic {
  readonly severity: "error" | "warning";
  /**
   * Where the issue applies. Conventional shapes:
   *   - `"User"`           — issue on a model
   *   - `"User.email"`     — issue on a model field
   *   - `"Role"`           — issue on an enum
   *   - `"Role.ADMIN"`     — issue on an enum value
   */
  readonly context: string;
  readonly message: string;
}

/** Default reporter: writes warnings and errors to stderr with a prefix tag. */
export function defaultReportDiagnostic(d: Diagnostic): void {
  const prefix = d.severity === "error" ? "[error]" : "[warn] ";
  // Prisma's JSON-RPC for generators is also on stderr (see
  // `core/src/generator/json-rpc.ts:4` — "expects newline-delimited responses
  // on STDERR"). The protocol lines are pure JSON; our diagnostic lines
  // start with "PolyPrism " and contain a colon, so they don't parse as
  // JSON and the Prisma CLI surfaces them as plain output. The same channel
  // is already used for parse-error reporting in json-rpc.ts, so this
  // doesn't open a new failure mode.
  console.error(`PolyPrism ${prefix} ${d.context}: ${d.message}`);
}
