// Renders one Prisma model as a PHP 8.4 domain class with property hooks.
//
// Output shape (for one model):
//
//   <?php
//   declare(strict_types=1);
//   namespace Generated\Models;
//
//   use Polyprism\Runtime\Coerce;
//   use Polyprism\Runtime\Normalise;
//
//   final class User
//   {
//       public string $email {
//           set(string $value) {
//               $this->email = Normalise::apply($value, [Normalise::TRIM, Normalise::LOWERCASE]);
//           }
//       }
//
//       public int $points = 0 {
//           set(int|string $value) {
//               $this->points = Coerce::int($value, 'User.points');
//           }
//       }
//
//       public ?string $name = null;
//
//       public function __construct(
//           string $email,
//           int|string $points = 0,
//           ?string $name = null,
//       ) {
//           $this->email = $email;
//           $this->points = $points;
//           if ($name !== null) {
//               $this->name = $name;
//           }
//       }
//   }
//
// Key shape decisions (and the reasons):
//
//   - **Properties live OUTSIDE the constructor**, not via property
//     promotion. Property promotion + hooks does not widen the constructor
//     param type — promoted-property assignment bypasses the set hook on
//     PHP 8.4. Tested locally; the constructor param keeps the property's
//     declared type, defeating @coerce. Explicit non-promoted properties +
//     a constructor body that assigns through `$this->prop = $arg` route
//     EVERY initial value through the hook, which is the load-bearing
//     contract for @coerce/@normalise to fire on construction.
//
//   - **No hook block for pure-strict fields with no normalise** — they
//     emit as plain typed properties (`public ?string $name = null;`).
//     This keeps unannotated fields visually indistinguishable from a
//     hand-written PHP DTO, and avoids paying the hook-dispatch cost when
//     no work would happen.
//
//   - **Constructor param widens to the SETTER input type**, not the
//     property type — so a caller can pass `'42'` to an `int $points` and
//     the value flows through `Coerce::int` on the way in.
//
//   - **Required-first then optional**, mirroring php-class. PHP 8.4
//     deprecates optional-before-required positional ordering. Named-
//     argument callers are unaffected by the reorder.

import type {
  FieldDef,
  ModelDef,
  NormaliseOp,
  PolyPrismConfig,
  PolyPrismIR,
} from "@polyprism/core";
import {
  buildEnumIdentLookup,
  buildModelIdentLookup,
  resolveFieldIdent,
  resolveTypeIdent,
} from "@polyprism/core";

import {
  type PhpCoerceDecision,
  type PhpCoerceRulesIssue,
  resolvePhpCoerceDecision,
} from "./coerce-rules.js";
import { formatPhpDefault, isCompileTimeConstantPhpExpr } from "./defaults.js";
import type { Diagnostic } from "./diagnostics.js";
import { phpNormaliseOpConstant, phpSingleQuote } from "./literals.js";
import { collectFieldExtraTags, renderPhpDoc } from "./phpdoc.js";
import { mapFieldPhpType } from "./type-mapper.js";
import { UseCollector } from "./use-collector.js";

export interface RenderPhpDomainClassOptions {
  readonly model: ModelDef;
  readonly ir: PolyPrismIR;
  readonly config: PolyPrismConfig;
  readonly modelsNamespace: string;
  readonly enumsNamespace: string;
  readonly jsonTypesNamespace: string;
  readonly jsonTypeClassNames: ReadonlySet<string>;
}

export interface RenderPhpDomainClassResult {
  readonly source: string;
  readonly issues: readonly Diagnostic[];
}

const RUNTIME_NAMESPACE = "Polyprism\\Runtime";
const COERCE_FQN = `${RUNTIME_NAMESPACE}\\Coerce`;
const NORMALISE_FQN = `${RUNTIME_NAMESPACE}\\Normalise`;

interface FieldPlan {
  readonly field: FieldDef;
  readonly ident: string;
  /**
   * The property declaration's full type, including `?` for nullable scalars.
   * For strict fields this matches the type-mapper output. For cross-type
   * `@coerce(target)` fields it shifts to the coerce target's canonical PHP
   * type — see `storageBaseType` below for the why.
   */
  readonly signatureType: string;
  /** Base type without the nullable prefix (e.g. `string`, `int`, `\DateTimeImmutable`). */
  readonly baseType: string;
  /** PHPDoc element type for lists, or null. */
  readonly listElementDoc: string | null;
  readonly decision: PhpCoerceDecision;
  readonly normaliseOps: readonly NormaliseOp[];
  /**
   * Default expression for the **constructor parameter**, or null if none.
   * Always emitted on the param line (PHP allows `new`/runtime expressions
   * in constructor-parameter default position).
   */
  readonly paramDefaultExpr: string | null;
  /**
   * Default expression for the **property declaration**, or null if none.
   * Restricted to compile-time-constant expressions (PHP only accepts those
   * in non-static property defaults). Runtime expressions like
   * `new \DateTimeImmutable()` are emitted on the constructor param only —
   * the property declaration goes without an initializer, and the
   * constructor body assigns to it on every construction.
   */
  readonly propertyDefaultExpr: string | null;
}

export function renderPhpDomainClass(
  opts: RenderPhpDomainClassOptions,
): RenderPhpDomainClassResult {
  const {
    model,
    ir,
    config,
    modelsNamespace,
    enumsNamespace,
    jsonTypesNamespace,
    jsonTypeClassNames,
  } = opts;
  const issues: Diagnostic[] = [];
  const collectDiagnostic = (d: Diagnostic): void => {
    issues.push(d);
  };

  const enumFqnLookup = buildEnumIdentLookup(ir, config, enumsNamespace);
  const modelFqnLookup = buildModelIdentLookup(ir, config, modelsNamespace);

  const selfIdent = resolveTypeIdent({
    schemaName: model.name,
    override: model.annotations.name,
    convention: config.naming.typeNaming,
  });
  const selfFqn = `${modelsNamespace}\\${selfIdent}`;

  const uses = new UseCollector(modelsNamespace);

  const plans: FieldPlan[] = [];
  for (const field of model.fields) {
    if (field.annotations.hide) continue;

    const ident = resolveFieldIdent({
      schemaName: field.name,
      override: field.annotations.name,
      convention: config.naming.fieldNaming,
    });

    const mapping = mapFieldPhpType({
      field,
      modelSchemaName: model.name,
      uses,
      enumFqnLookup,
      modelFqnLookup,
      selfModelFqn: selfFqn,
      jsonTypesNamespace,
      jsonTypeClassNames,
      onDiagnostic: collectDiagnostic,
    });

    // Stripped of the leading `?` (for nullable scalars) so the coerce-rules
    // decision matrix and setter-input-type composition can layer nullability
    // back on. Lists keep their `array` shape — the renderer skips hook emit
    // for lists anyway.
    const baseType = mapping.signatureType.startsWith("?")
      ? mapping.signatureType.slice(1)
      : mapping.signatureType;

    const ruleResult = resolvePhpCoerceDecision(field, model.name, baseType);
    for (const issue of ruleResult.issues) {
      issues.push(toDiagnostic(issue));
    }

    // **Storage type vs declared type.** The setter writes the coerce
    // result into `$this->prop`, so the property must be typed to accept
    // whatever the coerce function returns. For default-coerce scalars
    // (Int → coerce-int → int, DateTime → coerce-date → \DateTimeImmutable,
    // etc.) the type-mapper output already matches. But for cross-type
    // `@coerce(target)` (e.g. `String @coerce(int)`) the type-mapper says
    // `string` while the setter stores `int` — runtime TypeError on
    // assignment. Shift the property type to the coerce target's canonical
    // PHP type to keep the hook contract consistent.
    const coerceTargetType = storageTypeFor(ruleResult.decision.kind);
    const effectiveBaseType = coerceTargetType ?? baseType;
    // `mixed` already includes null in PHP's type system, so `?mixed` is a
    // syntax error. The only path that produces `mixed` here is a Json
    // field with no `@json(...)` annotation — type-mapper's wrapNullability
    // applies the same guard for the constructor-promotion renderer; we
    // re-apply it here because we re-derive the signature from baseType
    // (the coerce-target storage override means we can't just reuse
    // mapping.signatureType verbatim).
    const effectiveSignatureType = field.isList
      ? mapping.signatureType
      : field.isRequired || effectiveBaseType === "mixed"
        ? effectiveBaseType
        : `?${effectiveBaseType}`;

    const normaliseOps = resolveNormaliseOps(field, model.name, issues);

    for (const parseIssue of field.annotations.parseIssues) {
      issues.push({
        severity: parseIssue.severity,
        context: `${model.name}.${field.name}`,
        message: parseIssue.message,
      });
    }

    const paramDefaultExpr = formatPhpDefault(field, enumFqnLookup, uses);
    const propertyDefaultExpr =
      paramDefaultExpr !== null && isCompileTimeConstantPhpExpr(paramDefaultExpr)
        ? paramDefaultExpr
        : null;

    plans.push({
      field,
      ident,
      signatureType: effectiveSignatureType,
      baseType: effectiveBaseType,
      listElementDoc: mapping.listElementDoc,
      decision: ruleResult.decision,
      normaliseOps,
      paramDefaultExpr,
      propertyDefaultExpr,
    });
  }

  // Decide whether we need the runtime use statements. Done after the plan
  // loop so we only add them if any field actually uses them.
  let needCoerce = false;
  let needNormalise = false;
  for (const p of plans) {
    if (p.decision.runtimeMethod !== null) needCoerce = true;
    if (p.normaliseOps.length > 0) needNormalise = true;
  }
  if (needCoerce) uses.add(COERCE_FQN);
  if (needNormalise) uses.add(NORMALISE_FQN);

  // ---------- property declarations ----------
  const propertyBlocks = plans.map((p) => renderPropertyBlock(p, model.name));

  // ---------- constructor ----------
  type ParamEntry = { line: string; hasDefault: boolean };
  const paramEntries: ParamEntry[] = plans.map((p) => {
    const paramType = constructorParamType(p);
    const base = `        ${paramType} $${p.ident}`;
    const line = p.paramDefaultExpr !== null ? `${base} = ${p.paramDefaultExpr},` : `${base},`;
    return { line, hasDefault: p.paramDefaultExpr !== null };
  });
  // Stable partition: required first (preserve schema order), optional second.
  const paramLines = [
    ...paramEntries.filter((e) => !e.hasDefault).map((e) => e.line),
    ...paramEntries.filter((e) => e.hasDefault).map((e) => e.line),
  ];

  const constructorAssignments = plans.map((p) => renderConstructorAssign(p));

  const ctorParamBlock = paramLines.length > 0 ? `\n${paramLines.join("\n")}\n    ` : "";
  const ctorBodyBlock =
    constructorAssignments.length > 0 ? `\n${constructorAssignments.join("\n")}\n    ` : " ";

  const fromMethodBlock = renderFromMethod(plans, selfIdent);

  // ---------- assemble ----------
  const usesBlock = uses.render();
  const headerDoc = renderPhpDoc(model.annotations, { indent: 0 });
  const propertiesBody = propertyBlocks.length > 0 ? `\n${propertyBlocks.join("\n\n")}\n\n` : "\n";
  const fromMethodTail = fromMethodBlock ? `\n\n${fromMethodBlock}` : "";

  const source = [
    "<?php",
    "",
    "declare(strict_types=1);",
    "",
    `namespace ${modelsNamespace};`,
    "",
    `${usesBlock}${headerDoc}final class ${selfIdent}\n{` +
      `${propertiesBody}` +
      `    public function __construct(${ctorParamBlock}) {${ctorBodyBlock}}${fromMethodTail}\n}`,
    "",
  ].join("\n");

  return { source, issues };
}

// ---------- helpers ----------

function constructorParamType(plan: FieldPlan): string {
  const { decision, field, signatureType } = plan;
  // Lists keep `array` (per the type-mapper convention).
  if (field.isList) return signatureType;
  // strict path → use the (already-nullable-correct) signatureType verbatim.
  if (decision.kind === "strict") return signatureType;
  // Coerce path: widened setter input type, with nullability layered on
  // when the field is nullable.
  if (field.isRequired) return decision.setterInputType;
  return `${decision.setterInputType}|null`;
}

function renderPropertyBlock(plan: FieldPlan, modelName: string): string {
  const { ident, signatureType, decision, normaliseOps, propertyDefaultExpr, field } = plan;
  const fieldPath = `${modelName}.${field.name}`;
  const propertyDoc = renderPhpDoc(field.annotations, {
    indent: 4,
    extraTags: collectFieldExtraTags(field, plan.listElementDoc),
  });
  const defaultClause = propertyDefaultExpr !== null ? ` = ${propertyDefaultExpr}` : "";

  // No-hook path: emit a plain typed property. This is the common case for
  // String / Boolean / enum / relation / Bytes / Json / list fields without
  // any @normalise annotation. The result looks identical to a hand-written
  // PHP property — no hook-dispatch overhead, no visual noise.
  const needsHook = decision.kind !== "strict" || normaliseOps.length > 0;
  if (!needsHook) {
    return `${propertyDoc}    public ${signatureType} $${ident}${defaultClause};`;
  }

  // Hook path: emit `public T $x [= default] { set(SetterIn $value) { ... } }`.
  const setterParamType = setHookParamType(plan);
  const setterBody = renderSetterBody(plan, fieldPath);

  return (
    `${propertyDoc}    public ${signatureType} $${ident}${defaultClause} {\n` +
    `        set(${setterParamType} $value) {\n` +
    `${setterBody}` +
    `        }\n` +
    `    }`
  );
}

function setHookParamType(plan: FieldPlan): string {
  // The set hook's param type mirrors the constructor param type: widened
  // for coerce variants, nullable when the field is nullable.
  return constructorParamType(plan);
}

function renderSetterBody(plan: FieldPlan, fieldPath: string): string {
  const { ident, decision, normaliseOps, field } = plan;
  const nullable = !field.isRequired && !field.isList;
  const stringInput = decision.kind === "strict";

  // (1) normalise — only meaningful for string-shaped inputs.
  let valueExpr = "$value";
  let normaliseIsNullSafe = false;
  if (normaliseOps.length > 0) {
    const opsLiteral = renderNormaliseOpsLiteral(normaliseOps);
    if (stringInput) {
      // Pure String field — pick Normalise::apply vs Normalise::applyNullable.
      // applyNullable handles null internally, so no outer null-guard is
      // needed when we've already routed through it.
      if (nullable) {
        valueExpr = `Normalise::applyNullable($value, ${opsLiteral})`;
        normaliseIsNullSafe = true;
      } else {
        valueExpr = `Normalise::apply($value, ${opsLiteral})`;
      }
    } else {
      // Cross-type coerce (e.g. String @coerce(int)). Only normalise when
      // the input is actually a string at runtime.
      valueExpr = `(is_string($value) ? Normalise::apply($value, ${opsLiteral}) : $value)`;
    }
  }

  // (2) coerce
  const coerceExpr = renderCoerceCall(decision, valueExpr, fieldPath);

  // We're inside a hook (the caller in `renderPropertyBlock` already gated
  // on `needsHook = decision.kind !== "strict" || normaliseOps.length > 0`),
  // so by definition there's runtime work to do on non-null input. The only
  // reason to NOT emit the null-guard wrap is when the work itself is
  // null-safe — `Normalise::applyNullable` for pure-string nullable fields.
  // Every other nullable path needs the guard so we don't pass `null` into
  // `Coerce::int` and friends (which would throw TypeError).
  if (nullable && !normaliseIsNullSafe) {
    return `            $this->${ident} = $value === null ? null : ${coerceExpr};\n`;
  }
  return `            $this->${ident} = ${coerceExpr};\n`;
}

function renderCoerceCall(
  decision: PhpCoerceDecision,
  valueExpr: string,
  fieldPath: string,
): string {
  switch (decision.kind) {
    case "strict":
      return valueExpr;
    case "coerce-int":
      return `Coerce::int(${valueExpr}, ${phpSingleQuote(fieldPath)})`;
    case "coerce-float":
      return `Coerce::float(${valueExpr}, ${phpSingleQuote(fieldPath)})`;
    case "coerce-bigint":
      return `Coerce::bigint(${valueExpr}, ${phpSingleQuote(fieldPath)})`;
    case "coerce-date":
      return `Coerce::date(${valueExpr}, ${phpSingleQuote(fieldPath)})`;
    case "coerce-decimal":
      return `Coerce::decimal(${valueExpr}, ${phpSingleQuote(fieldPath)})`;
    case "coerce-string":
      return `(string) ${valueExpr}`;
  }
}

function renderNormaliseOpsLiteral(ops: readonly NormaliseOp[]): string {
  // Render as a PHP array of `Normalise::*` class constants — safer than
  // raw strings (a typo in `Normalise::TROM` is a compile-time error
  // rather than a silent no-op at runtime). The op→constant mapping is
  // canonicalised in `./literals.ts` so any new `NormaliseOp` variant
  // has to extend it AND the runtime's class constants together.
  const constants = ops.map(phpNormaliseOpConstant).join(", ");
  return `[${constants}]`;
}

function renderConstructorAssign(plan: FieldPlan): string {
  const { ident } = plan;
  // Always assign — required-no-default fields have a mandatory param,
  // required-with-default fields inherit the param's default, nullable
  // fields default to `null` on the param. PHP doesn't distinguish "unset"
  // from "null" for typed nullable props post-construction, so unconditional
  // assignment matches the same shape the property hook contract wants.
  return `        $this->${ident} = $${ident};`;
}

/**
 * Emit a `static from(array $data): self` factory that hydrates a model
 * from a Record-like array (typical sources: a JSON-decoded request body,
 * a Prisma row returned from `$client->user->findFirst()`, a queue message
 * payload). Routes every field through the constructor so property hooks
 * fire — `@coerce` and `@normalise` rules apply on the way in, just like
 * direct `new User(...)` calls.
 *
 * Argument ordering mirrors the constructor (required-first, optional-
 * second). Required-no-default fields throw `\TypeError` with a clear
 * message if absent from `$data`. Optional / defaulted fields fall through
 * to their constructor default expression via PHP's `??` operator.
 *
 * Returns an empty string for models with zero visible fields — the
 * factory would be degenerate.
 */
function renderFromMethod(plans: readonly FieldPlan[], selfIdent: string): string {
  if (plans.length === 0) return "";

  // Same partition as the constructor: required first (preserve schema
  // order), optional second (preserve schema order).
  const required = plans.filter((p) => p.paramDefaultExpr === null);
  const optional = plans.filter((p) => p.paramDefaultExpr !== null);
  const ordered = [...required, ...optional];

  const argLines = ordered.map((p) => renderFromArg(p, selfIdent));

  return (
    `    /**\n` +
    `     * Hydrate ${selfIdent} from a Record-like array (e.g. a JSON-decoded\n` +
    `     * request body, a Prisma row, a queue message payload). Routes every\n` +
    `     * field through the constructor so property hooks fire — \`@coerce\` and\n` +
    `     * \`@normalise\` rules apply identically to a direct \`new ${selfIdent}(...)\`\n` +
    `     * call.\n` +
    `     *\n` +
    `     * **Not a validator.** Required fields missing from \`$data\` throw\n` +
    `     * \`\\TypeError\` with the field path. Type-mismatched values (e.g. an\n` +
    `     * array for a typed property) propagate as PHP \`\\TypeError\` from the\n` +
    `     * underlying property hook. Pre-validate untrusted input at the boundary\n` +
    `     * (JSON-schema, attribute validation, etc.) if those failure modes need\n` +
    `     * to be caught with richer context.\n` +
    `     *\n` +
    `     * Unknown keys in \`$data\` are silently dropped.\n` +
    `     *\n` +
    `     * @param array<string, mixed> $data\n` +
    `     */\n` +
    `    public static function from(array $data): self\n` +
    `    {\n` +
    `        return new self(\n` +
    `${argLines.join("\n")}\n` +
    `        );\n` +
    `    }`
  );
}

function renderFromArg(plan: FieldPlan, selfIdent: string): string {
  const key = plan.ident;
  const keyLiteral = phpSingleQuote(key);

  if (plan.paramDefaultExpr === null) {
    // Required-no-default: throw if missing. PHP 8.0+ supports `throw` as
    // an expression on the right side of `??`, so this stays as one line
    // per field rather than wrapping into a separate guard block.
    const message = `${selfIdent}::from(): missing required field "${key}"`;
    return (
      `            ${key}: $data[${keyLiteral}] ` +
      `?? throw new \\TypeError(${phpSingleQuote(message)}),`
    );
  }
  // Optional / defaulted: fall through to the constructor's default
  // expression. Note: `??` returns the default on missing key OR explicit
  // null. For nullable fields without a default, the default expression IS
  // `null`, so the behaviour is identical to "use $data['key'] if present
  // and not null". For defaulted fields a passed-null collapses to the
  // default — consistent with PHP's `??` semantics throughout the language.
  return `            ${key}: $data[${keyLiteral}] ?? ${plan.paramDefaultExpr},`;
}

function resolveNormaliseOps(
  field: FieldDef,
  modelName: string,
  issues: Diagnostic[],
): readonly NormaliseOp[] {
  const ops = field.annotations.normalise;
  if (!ops || ops.length === 0) return [];

  if (field.isList) return [];

  if (field.type.kind !== "scalar" || field.type.scalar !== "String") {
    issues.push({
      severity: "warning",
      context: `${modelName}.${field.name}`,
      message: "@normalise has no effect on non-String fields (silently ignored).",
    });
    return [];
  }

  if (field.isRequired && ops.includes("nullEmptyToNull")) {
    issues.push({
      severity: "error",
      context: `${modelName}.${field.name}`,
      message:
        "@normalise(nullEmptyToNull) requires the field to be nullable. Mark the field optional in the schema or remove the op.",
    });
    return ops.filter((op) => op !== "nullEmptyToNull");
  }

  return ops;
}

function toDiagnostic(issue: PhpCoerceRulesIssue): Diagnostic {
  return {
    severity: issue.severity,
    context: issue.fieldPath,
    message: issue.message,
  };
}

/**
 * The canonical PHP type the coerce target writes into storage, or `null`
 * for `strict` (storage type follows the type-mapper output verbatim).
 *
 * This is what bridges cross-type `@coerce(target)` to a consistent
 * property declaration: the type-mapper looks at the field's declared
 * Prisma scalar (`String? @coerce(int)` → `?string`), but the setter
 * writes the coerce result (`int`) — so the property must be typed to
 * accept `int`, not `string`. Returning the target's PHP type from this
 * helper lets the renderer override the type-mapper output when needed.
 *
 * Returning `null` for `strict` keeps the type-mapper output authoritative
 * for non-coerce fields — those go through unchanged.
 */
function storageTypeFor(kind: PhpCoerceDecision["kind"]): string | null {
  switch (kind) {
    case "strict":
      return null;
    case "coerce-int":
    case "coerce-bigint":
      return "int";
    case "coerce-float":
      return "float";
    case "coerce-decimal":
      return "string";
    case "coerce-date":
      return "\\DateTimeImmutable";
    case "coerce-string":
      return "string";
  }
}
