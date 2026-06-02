// Renders a Prisma model as a TypeScript domain class.
//
// Output shape (for one model):
//
//   import { Role } from "./enums/Role.js";
//   import { normalise, coerceInt, coerceDate } from "@polyprism/runtime";
//
//   export interface UserInit {
//     email: string;
//     name?: string | null;
//     points?: number | string;          // Int + coerce-by-default → widened
//     role?: Role;
//     // id, createdAt excluded — Prisma assigns at insert (cuid, now)
//   }
//
//   export class User {
//     #id!: string;
//     #email!: string;
//     #name: string | null = null;
//     #points!: number;
//     #role!: Role;
//     #createdAt!: Date;
//
//     constructor(init: UserInit) {
//       Object.defineProperty(this, "id", { get: () => this.#id, set: (v: string) => { this.#id = v; }, enumerable: true, configurable: true });
//       Object.defineProperty(this, "email", { get: () => this.#email, set: (v: string) => { this.#email = normalise(v, ["trim", "lowercase"]); }, enumerable: true, configurable: true });
//       // ... per-field defineProperty calls
//
//       this.email = init.email;
//       if (init.name !== undefined) this.name = init.name;
//       this.points = init.points ?? 0;
//       this.role = init.role ?? Role.MEMBER;
//     }
//   }
//
// The per-instance Object.defineProperty strategy (instead of prototype
// accessors) is what lets Prisma read the instance directly:
// `prisma.user.update({ data: userInstance })` works because Object.keys()
// returns the field names. Prototype accessors would leave the instance
// looking like an empty object to Prisma's iteration.

import type {
  DefaultValue,
  FieldDef,
  ModelDef,
  NamingConfig,
  PolyPrismConfig,
  PolyPrismIR,
  ScalarType,
} from "@polyprism/core";
import { resolveFieldIdent, resolveTypeFilename, resolveTypeIdent } from "@polyprism/core";

import {
  type CoerceDecision,
  type CoerceRulesIssue,
  resolveCoerceDecision,
} from "./coerce-rules.js";
import { ImportCollector } from "./imports.js";
import { renderJsDoc } from "./jsdoc.js";
import { mapFieldTsType } from "./type-mapper.js";

export interface RenderDomainClassOptions {
  readonly model: ModelDef;
  readonly ir: PolyPrismIR;
  readonly config: PolyPrismConfig;
}

export interface RenderDomainClassResult {
  readonly source: string;
  readonly issues: readonly CoerceRulesIssue[];
}

/**
 * Field idents that collide with Object/Function prototype semantics and
 * would produce broken codegen:
 *
 *   - `constructor` — defining `get constructor()` on Class.prototype shadows
 *     the implicit slot that `instance.constructor === MyClass` relies on,
 *     breaking reflection / `instanceof`-adjacent patterns.
 *   - `__proto__` — Object.prototype.__proto__ is an inherited accessor, not
 *     an own property. `Object.getOwnPropertyDescriptor(Class.prototype,
 *     "__proto__")` returns `undefined`, so the publish-enumerable shim loop
 *     silently skips it — `Object.keys(instance)` would not contain it, and
 *     `prisma.user.update({ data: instance })` would silently drop the field.
 *
 * Other "shadow" names (`toString`, `valueOf`, `hasOwnProperty`, etc.) DO
 * publish correctly through the shim loop and don't break the Prisma read
 * contract — they just override the inherited method. We don't flag those
 * here; users who hit them can rename via `@name(...)`.
 */
const RESERVED_RUNTIME_BREAKING_IDENTS: ReadonlySet<string> = new Set(["constructor", "__proto__"]);

interface FieldPlan {
  readonly field: FieldDef;
  readonly ident: string; // public field name (after naming convention)
  readonly declaredType: string; // getter return type (e.g. "string | null")
  readonly decision: CoerceDecision; // setter input type + coerce strategy
  readonly normaliseOps: readonly string[];
  /**
   * The default expression to apply when init.field is undefined.
   * - For Prisma function defaults (cuid/now/uuid) — null (omitted from UserInit, never assigned in constructor)
   * - For literal/enum/list defaults — a TS expression like "0", `Role.MEMBER`, "[]"
   * - For nullable fields without an explicit default — null (handled via `if (init.x !== undefined)`)
   * - For required fields without a default — undefined (assigned unconditionally from init.x)
   */
  readonly initFallback:
    | { kind: "default-expr"; expr: string }
    | { kind: "none" }
    | { kind: "prisma-assigned" };
  readonly privateFieldInitializer: string | null; // "= []" / "= null" / null for `!`
}

export function renderDomainClass(opts: RenderDomainClassOptions): RenderDomainClassResult {
  const { model, ir, config } = opts;

  const enumLookup = new Map<string, string>(
    ir.enums.map((e) => [
      e.name,
      resolveTypeIdent({
        schemaName: e.name,
        override: e.annotations.name,
        convention: config.naming.typeNaming,
      }),
    ]),
  );
  const modelLookup = new Map<string, string>(
    ir.models.map((m) => [
      m.name,
      resolveTypeIdent({
        schemaName: m.name,
        override: m.annotations.name,
        convention: config.naming.typeNaming,
      }),
    ]),
  );

  const selfIdent = modelLookup.get(model.name) ?? model.name;
  const imports = new ImportCollector();
  const issues: CoerceRulesIssue[] = [];

  // Plan each field upfront so the multiple emit passes (private fields,
  // defineProperty calls, init-assignment, UserInit) can share decisions.
  const plans: FieldPlan[] = [];

  for (const field of model.fields) {
    if (field.annotations.hide) continue;

    const ident = resolveFieldIdent({
      schemaName: field.name,
      override: field.annotations.name,
      convention: config.naming.fieldNaming,
    });

    // Reject ident collisions with prototype semantics that would silently
    // break either reflection (`constructor`) or the Prisma read contract
    // (`__proto__` falls out of Object.keys because the descriptor isn't an
    // own property on the prototype). We push an emit-time error and skip
    // the field — emitting it anyway would produce a class that compiles but
    // misbehaves at runtime, which is worse than failing loudly.
    if (RESERVED_RUNTIME_BREAKING_IDENTS.has(ident)) {
      issues.push({
        severity: "error",
        fieldPath: `${model.name}.${field.name}`,
        message:
          `Field '${field.name}' resolves to ident '${ident}', which collides with a built-in prototype property and would produce broken codegen. ` +
          `Rename the field in the schema or use \`@name(...)\` to set a different ident.`,
      });
      continue;
    }

    const declaredType = mapFieldTsType({
      field,
      modelSchemaName: model.name,
      imports,
      naming: config.naming,
      enumLookup,
      modelLookup,
      selfModelIdent: selfIdent,
    });

    // Surface any parse-time annotation issues (e.g. `@noCoerce(args)` with
    // ignored arguments) with the field path attached.
    for (const issue of field.annotations.parseIssues) {
      issues.push({
        severity: issue.severity,
        fieldPath: `${model.name}.${field.name}`,
        message: issue.message,
      });
    }

    const ruleResult = resolveCoerceDecision(field, model.name, declaredType);
    issues.push(...ruleResult.issues);

    // Widen the setter input type to include null when the field is nullable.
    // resolveCoerceDecision widens for coerce variants but does not know about
    // nullability — we apply it here so the logic stays in one place.
    const decision = applyNullabilityToDecision(ruleResult.decision, field);

    // Normalise ops apply only when the (widened) setter still accepts a
    // string-shaped input. For cross-type coerce variants whose input doesn't
    // include `string`, normalise is dropped with a warning. For v0.2 we
    // keep the supported intersection narrow: pure string fields, or string
    // fields with cross-type @coerce.
    const normaliseOps = resolveNormaliseOps(field, decision, model.name, issues);

    // Promote Decimal to a value import when the coerce path needs the constructor.
    if (decision.kind === "coerce-decimal") {
      imports.addValue("@prisma/client/runtime/library", "Decimal");
    }

    if (decision.runtimeFn) {
      imports.addValue("@polyprism/runtime", decision.runtimeFn);
    }
    if (normaliseOps.length > 0) {
      const fn =
        !field.isRequired && isStringSetterInput(decision) ? "normaliseNullable" : "normalise";
      imports.addValue("@polyprism/runtime", fn);
    }

    const initFallback = resolveInitFallback(field, enumLookup, config.naming);

    // Promote enum import to value when the enum is used as a default expression.
    if (initFallback.kind === "default-expr" && field.type.kind === "enum") {
      const enumIdent = enumLookup.get(field.type.enumName);
      if (enumIdent) {
        const filename = resolveTypeFilename(enumIdent, config.naming.fileNaming);
        imports.addValue(`./enums/${filename}.js`, enumIdent);
      }
    }

    // Promote Decimal import to value when the default expression uses `new Decimal(...)`.
    // For the common coerce-decimal path the value import is already added above; this
    // catches the rare `@noCoerce Decimal @default(0)` combination where the field is
    // strict but still needs the constructor at construction time.
    if (
      initFallback.kind === "default-expr" &&
      field.type.kind === "scalar" &&
      field.type.scalar === "Decimal"
    ) {
      imports.addValue("@prisma/client/runtime/library", "Decimal");
    }

    plans.push({
      field,
      ident,
      declaredType,
      decision,
      normaliseOps,
      initFallback,
      privateFieldInitializer: resolvePrivateFieldInitializer(field),
    });
  }

  // -- UserInit interface --
  const initLines: string[] = [];
  for (const p of plans) {
    if (p.initFallback.kind === "prisma-assigned") continue;
    const optionalMarker = isInitOptional(p) ? "?" : "";
    initLines.push(`  ${p.ident}${optionalMarker}: ${p.decision.setterInputType};`);
  }

  // -- private field declarations --
  const privateFieldLines = plans.map((p) => {
    if (p.privateFieldInitializer) {
      return `  #${p.ident}: ${p.declaredType} ${p.privateFieldInitializer};`;
    }
    return `  #${p.ident}!: ${p.declaredType};`;
  });

  // -- prototype getter/setter accessors --
  //
  // Two reasons for using real class accessors rather than per-instance
  // Object.defineProperty closures:
  //
  //   1. **Asymmetric types.** A coerce-by-default field needs `get email():
  //      string` (canonical) and `set email(v: string | null)` (widened).
  //      `declare email: ...` is symmetric only and rejects widened-rhs
  //      assignments in the constructor. Class accessor syntax accepts the
  //      asymmetry natively.
  //
  //   2. **Logic lives once.** The get/set bodies are on the prototype, not
  //      duplicated into every instance. The constructor only re-publishes
  //      the accessor as an enumerable own-property (cheap descriptor copy)
  //      so Prisma's Object.keys()-based reads see the field.
  const accessorBlocks = plans.map((p) => renderAccessorBlock(p, model.name));
  const accessorBody = accessorBlocks.join("\n\n");

  // -- constructor body --
  // The "publish enumerable" loop runs once per construction. It re-installs
  // each prototype accessor as an own enumerable property on `this`, which
  // is what makes `Object.keys(user)` return field names (the load-bearing
  // bit for `prisma.user.update({ data: instance })` to work).
  const fieldKeysLiteral =
    plans.length > 0 ? plans.map((p) => JSON.stringify(p.ident)).join(", ") : "";
  const publishEnumerableLines =
    plans.length > 0
      ? `    for (const key of [${fieldKeysLiteral}] as const) {\n` +
        `      const desc = Object.getOwnPropertyDescriptor(${selfIdent}.prototype, key);\n` +
        `      if (desc) Object.defineProperty(this, key, { ...desc, enumerable: true });\n` +
        `    }\n`
      : "";

  const initAssignmentLines = plans
    .map((p) => renderInitAssignment(p))
    .filter((line): line is string => line !== null);

  const headerDoc = renderJsDoc(model.annotations, { indent: 0 });
  const importBlock = imports.render();

  const initBody = initLines.length > 0 ? `\n${initLines.join("\n")}\n` : "\n";
  const privateBody = privateFieldLines.length > 0 ? `\n${privateFieldLines.join("\n")}\n` : "\n";
  const initAssignmentBody =
    initAssignmentLines.length > 0 ? `\n${initAssignmentLines.join("\n")}\n` : "";
  const accessorBlock = accessorBody.length > 0 ? `\n${accessorBody}\n` : "";

  const constructorParam = initLines.length > 0 ? `init: ${selfIdent}Init` : "";

  // -- post-constructor method emits (rc.0 bundles from/toJSON/builder) --
  const fromMethod = renderFromMethod(selfIdent, plans);
  const toJsonMethod = renderToJSONMethod(plans);
  const staticBuilderMethod = renderStaticBuilderMethod(selfIdent, plans);
  const builderClass = renderBuilderClass(selfIdent, plans);

  const postConstructorBlock =
    `\n${fromMethod}` +
    (toJsonMethod ? `\n${toJsonMethod}` : "") +
    (staticBuilderMethod ? `\n${staticBuilderMethod}` : "");

  const builderTail = builderClass ? `\n${builderClass}` : "";

  const source =
    `${importBlock}` +
    `${headerDoc}export interface ${selfIdent}Init {${initBody}}\n\n` +
    `${headerDoc}export class ${selfIdent} {${privateBody}${accessorBlock}\n` +
    `  constructor(${constructorParam}) {\n` +
    `${publishEnumerableLines}${initAssignmentBody}` +
    `  }\n` +
    `${postConstructorBlock}` +
    `}\n` +
    `${builderTail}`;

  return { source, issues };
}

// ---------- helpers ----------

function applyNullabilityToDecision(decision: CoerceDecision, field: FieldDef): CoerceDecision {
  if (field.isList || field.isRequired) return decision;
  if (decision.kind === "strict") {
    // Already widened by mapFieldTsType (returns `string | null` for nullable string).
    // strictDecision uses declaredType, so it's already `... | null`.
    return decision;
  }
  // For coerce variants, widen the input type to allow null pass-through.
  return {
    ...decision,
    setterInputType: `${decision.setterInputType} | null`,
  };
}

function resolveNormaliseOps(
  field: FieldDef,
  decision: CoerceDecision,
  modelName: string,
  issues: CoerceRulesIssue[],
): readonly string[] {
  const ops = field.annotations.normalise;
  if (!ops || ops.length === 0) return [];

  // Lists already warn in coerce-rules; double-warning would be noise.
  if (field.isList) return [];

  // Skip on non-String fields (where normalise has no meaningful effect).
  // Note: a String field with @coerce(int) gets cross-type setter input; we
  // still let normalise fire by guarding on `typeof v === "string"` at emit.
  if (field.type.kind !== "scalar" || field.type.scalar !== "String") {
    issues.push({
      severity: "warning",
      fieldPath: `${modelName}.${field.name}`,
      message: "@normalise has no effect on non-String fields (silently ignored).",
    });
    return [];
  }

  // @normalise(nullEmptyToNull) on a non-nullable field is an error.
  if (field.isRequired && ops.includes("nullEmptyToNull")) {
    issues.push({
      severity: "error",
      fieldPath: `${modelName}.${field.name}`,
      message:
        "@normalise(nullEmptyToNull) requires the field to be nullable. Mark the field optional in the schema or remove the op.",
    });
    return ops.filter((op) => op !== "nullEmptyToNull");
  }

  // Touch the decision so TS knows we use the variable (linter aid).
  void decision;
  return ops;
}

function isStringSetterInput(decision: CoerceDecision): boolean {
  // Used to pick between normalise (string) and normaliseNullable (string | null).
  // For pure String fields, decision.kind is "strict" and setterInputType is
  // "string" or "string | null".
  return decision.kind === "strict";
}

function resolveInitFallback(
  field: FieldDef,
  enumLookup: ReadonlyMap<string, string>,
  naming: NamingConfig,
): FieldPlan["initFallback"] {
  if (!field.hasDefaultValue || !field.default) {
    return { kind: "none" };
  }

  const d = field.default;
  if (d.kind === "function") {
    // cuid(), uuid(), now(), autoincrement(), dbgenerated() — Prisma assigns
    // at insert time. Exclude from UserInit; never assign in the constructor.
    return { kind: "prisma-assigned" };
  }

  const expr = formatDefaultExpr(field, d, enumLookup, naming);
  if (expr === null) return { kind: "none" };
  return { kind: "default-expr", expr };
}

function formatDefaultExpr(
  field: FieldDef,
  d: DefaultValue,
  enumLookup: ReadonlyMap<string, string>,
  naming: NamingConfig,
): string | null {
  if (d.kind === "list") return "[]";
  if (d.kind !== "literal") return null;

  const value = d.value;
  if (value === null) return "null";

  if (typeof value === "string") {
    if (field.type.kind === "scalar" && field.type.scalar === "String") {
      return JSON.stringify(value);
    }
    if (field.type.kind === "enum") {
      const enumIdent = enumLookup.get(field.type.enumName);
      if (!enumIdent) return null;
      // The value-import promotion happens at the caller; we only emit the
      // identifier expression here.
      void naming;
      return `${enumIdent}.${value}`;
    }
    return null;
  }

  if (typeof value === "number") {
    if (
      field.type.kind === "scalar" &&
      (field.type.scalar === "Int" || field.type.scalar === "Float")
    ) {
      return String(value);
    }
    if (field.type.kind === "scalar" && field.type.scalar === "Decimal") {
      // Decimal is already a value-import in domain-class (for the coerce
      // path); wrapping the literal lets `@default(0)` flow through to a
      // proper optional `Init.shippingRate ?? new Decimal(0)` fallback.
      return `new Decimal(${value})`;
    }
    if (field.type.kind === "scalar" && field.type.scalar === "BigInt") {
      return `BigInt(${value})`;
    }
    return null;
  }

  if (typeof value === "boolean") {
    if (field.type.kind === "scalar" && field.type.scalar === "Boolean") {
      return value ? "true" : "false";
    }
    return null;
  }

  return null;
}

function resolvePrivateFieldInitializer(field: FieldDef): string | null {
  if (field.isList) return "= []";
  // ANY nullable field initialises its private slot to null so the runtime
  // value matches the declared type. The previous "= null only when no
  // default" rule lied for two cases:
  //   1. nullable + prisma-assigned default (e.g. `DateTime? @default(now())`)
  //      — the default is set by Prisma at insert, not by the constructor,
  //      so without an explicit `= null` the private field stays undefined.
  //   2. nullable + literal default (e.g. `String? @default("INCOMPLETE")`) —
  //      see renderInitAssignment for how the literal default is applied; the
  //      private-field initialiser still needs to be null so the slot is a
  //      defined value before the init-assignment line runs.
  if (!field.isRequired) return "= null";
  return null; // `!` definite assignment
}

function isInitOptional(plan: FieldPlan): boolean {
  // Optional in UserInit when the field has a usable default, or is nullable.
  if (plan.field.isList) return true;
  if (!plan.field.isRequired) return true;
  if (plan.initFallback.kind === "default-expr") return true;
  return false;
}

function renderAccessorBlock(plan: FieldPlan, modelName: string): string {
  const { ident, declaredType, decision, field, initFallback } = plan;
  const fieldPath = `${modelName}.${field.name}`;
  const setterParam = `v: ${decision.setterInputType}`;
  const assignExpr = renderSetterAssign(plan, fieldPath);

  const doc = renderJsDoc(field.annotations, {
    indent: 2,
    extraTags: buildFieldExtraTags(field, initFallback),
  });

  return (
    `${doc}` +
    `  get ${ident}(): ${declaredType} {\n` +
    `    return this.#${ident};\n` +
    `  }\n` +
    `  set ${ident}(${setterParam}) {\n` +
    `    ${assignExpr}\n` +
    `  }`
  );
}

function renderSetterAssign(plan: FieldPlan, fieldPath: string): string {
  const { ident, decision, normaliseOps, field } = plan;
  const nullable = !field.isRequired && !field.isList;
  const stringInput = isStringSetterInput(decision);

  // Build the "value passed to storage" expression. Two phases:
  //   1. apply normalise (if any)
  //   2. apply coerce (if any)
  //
  // For nullable fields we wrap the whole thing in a null-guard so the
  // pipeline only fires on non-null inputs.

  // (1) normalise — only applies to string-shaped inputs.
  let valueExpr = "v";
  if (normaliseOps.length > 0) {
    const opsLiteral = JSON.stringify(normaliseOps);
    if (stringInput) {
      // Pure String field — pick normalise vs normaliseNullable.
      valueExpr = nullable
        ? `normaliseNullable(v, ${opsLiteral} as const)`
        : `normalise(v, ${opsLiteral} as const)`;
    } else {
      // Cross-type coerce field (e.g. String @coerce(int)). Only normalise
      // when the input is actually a string at runtime.
      valueExpr = `(typeof v === "string" ? normalise(v, ${opsLiteral} as const) : v)`;
    }
  }

  // (2) coerce
  const coerceExpr = renderCoerceCall(decision, valueExpr, fieldPath);

  // The null-guard wrap is only needed when there's actual work to skip on
  // null input — either a coerce call (which would throw on null) or a
  // normalise call (which is null-safe for normaliseNullable but emitting
  // the guard keeps the call tighter). For a strict pass-through field with
  // no normalisation, the wrap collapses to `v === null ? null : v`, which
  // is just `v` — cosmetic dead code in the generated output. Skip it.
  const hasRuntimeWork = decision.kind !== "strict" || normaliseOps.length > 0;

  if (nullable && hasRuntimeWork) {
    return `this.#${ident} = v === null ? null : ${coerceExpr};`;
  }
  return `this.#${ident} = ${coerceExpr};`;
}

function renderCoerceCall(decision: CoerceDecision, valueExpr: string, fieldPath: string): string {
  switch (decision.kind) {
    case "strict":
      return valueExpr;
    case "coerce-int":
      return `coerceInt(${valueExpr}, ${JSON.stringify(fieldPath)})`;
    case "coerce-float":
      return `coerceFloat(${valueExpr}, ${JSON.stringify(fieldPath)})`;
    case "coerce-bigint":
      return `coerceBigInt(${valueExpr}, ${JSON.stringify(fieldPath)})`;
    case "coerce-date":
      return `coerceDate(${valueExpr}, ${JSON.stringify(fieldPath)})`;
    case "coerce-decimal":
      // Inlined per-model so @polyprism/runtime stays Prisma-free.
      return `(${valueExpr} instanceof Decimal ? ${valueExpr} : new Decimal(${valueExpr}))`;
    case "coerce-string":
      return `String(${valueExpr})`;
  }
}

function renderInitAssignment(plan: FieldPlan): string | null {
  const { ident, field, initFallback } = plan;

  // Prisma assigns at insert — never in the constructor, never in UserInit.
  if (initFallback.kind === "prisma-assigned") return null;

  // Required with a usable default — coalesce with the default expression.
  if (field.isRequired && !field.isList && initFallback.kind === "default-expr") {
    return `    this.${ident} = init.${ident} ?? ${initFallback.expr};`;
  }

  // Required without a default — must be in init; assign unconditionally.
  if (field.isRequired && !field.isList) {
    return `    this.${ident} = init.${ident};`;
  }

  // Nullable with a literal default — apply the default when init.X is
  // undefined, preserve explicit null when init.X is null. We can't use
  // `init.X ?? default` here because `null ?? default` would replace an
  // intentional null with the default, contradicting the type contract.
  if (!field.isRequired && !field.isList && initFallback.kind === "default-expr") {
    return `    this.${ident} = init.${ident} !== undefined ? init.${ident} : ${initFallback.expr};`;
  }

  // Lists: private field initializer already set to []; assign from init if provided.
  // Nullable without a default: private field initializer already set to null;
  // assign from init if provided.
  return `    if (init.${ident} !== undefined) this.${ident} = init.${ident};`;
}

function buildFieldExtraTags(
  field: {
    isRequired: boolean;
    isList: boolean;
    nativeType: { name: string; args: readonly string[] } | null;
  },
  initFallback: FieldPlan["initFallback"],
): string[] {
  const tags: string[] = [];
  if (field.nativeType) {
    const args = field.nativeType.args.join(", ");
    tags.push(args ? `@db.${field.nativeType.name}(${args})` : `@db.${field.nativeType.name}`);
  }
  // For required + prisma-assigned fields (`@default(cuid())`,
  // `@default(now())`, `@default(autoincrement())`, etc.), the declared
  // getter type is honest only AFTER Prisma persists the row. On a
  // freshly-constructed instance the private slot is `undefined`, which
  // means a consumer doing `const o = new Order({...}); o.id.toString()`
  // hits "Cannot read properties of undefined" with no field context.
  // Surface the contract via an `@remarks` JSDoc tag so IDE hovers + npm
  // doc tooling pick it up. We don't make the getter throw because the
  // graceful-undefined behaviour is load-bearing for toJSON() — see the
  // `=== undefined` guard for BigInt fields in renderToJSONMethod.
  if (field.isRequired && !field.isList && initFallback.kind === "prisma-assigned") {
    tags.push(
      "@remarks Prisma-assigned at insert time — reading on a freshly-constructed instance returns `undefined` until the row has been persisted (and `from()` has hydrated the value back, or Prisma has returned the populated row). The declared type is honest post-insert.",
    );
  }
  return tags;
}

// ---------- post-constructor method emit (from / toJSON / builder) ----------

function renderFromMethod(selfIdent: string, plans: readonly FieldPlan[]): string {
  // `from()` hydrates a domain class from an untrusted Record<string, unknown>
  // (a JSON body, a Prisma row, a flat form payload). It deliberately routes
  // everything through the setter pipeline so @coerce + @normalise fire on
  // the way in, and silently ignores keys the model doesn't recognise so a
  // payload with extra junk doesn't blow up at the boundary.
  //
  // Two phases:
  //   1. Filter `data` down to UserInit-shaped keys, pass to the constructor
  //      so defaults + required-no-default checks fire.
  //   2. For prisma-assigned fields (@default(cuid()), @default(now()), etc.)
  //      — these aren't in UserInit but ARE writable post-construction — assign
  //      them through the (enumerable per-instance) setter. This is the path
  //      Prisma's deserialisation would hit when hydrating a fetched row.
  const initPlans = plans.filter((p) => p.initFallback.kind !== "prisma-assigned");
  const prismaAssignedPlans = plans.filter((p) => p.initFallback.kind === "prisma-assigned");

  const initKeysLiteral =
    initPlans.length > 0 ? initPlans.map((p) => JSON.stringify(p.ident)).join(", ") : "";

  const initFilterBlock =
    initPlans.length > 0
      ? `    const initKeys = [${initKeysLiteral}] as const;\n` +
        `    const init: Record<string, unknown> = {};\n` +
        `    for (const key of initKeys) {\n` +
        `      if (data[key] !== undefined) init[key] = data[key];\n` +
        `    }\n` +
        // Double-cast through `unknown`: TS strict mode refuses the direct
        // `Record<string, unknown>` → `${selfIdent}Init` cast because the
        // types don't sufficiently overlap. We trust the runtime filter
        // above to have made `init` Init-shaped, so we widen through unknown.
        `    const instance = new ${selfIdent}(init as unknown as ${selfIdent}Init);\n`
      : `    const instance = new ${selfIdent}();\n`;

  const prismaAssignedKeysLiteral =
    prismaAssignedPlans.length > 0
      ? prismaAssignedPlans.map((p) => JSON.stringify(p.ident)).join(", ")
      : "";

  const prismaAssignedBlock =
    prismaAssignedPlans.length > 0
      ? `    const assignKeys = [${prismaAssignedKeysLiteral}] as const;\n` +
        `    for (const key of assignKeys) {\n` +
        `      if (data[key] !== undefined) {\n` +
        `        (instance as unknown as Record<string, unknown>)[key] = data[key];\n` +
        `      }\n` +
        `    }\n`
      : "";

  return (
    `  /**\n` +
    `   * Hydrate ${selfIdent} from an untrusted object shape (e.g. a JSON body\n` +
    `   * or a Prisma row). Routes through the setter pipeline so \`@coerce\` and\n` +
    `   * \`@normalise\` rules fire. Unknown keys are silently dropped.\n` +
    `   *\n` +
    `   * **Not a validator.** \`from()\` is a type-aware constructor adapter, not\n` +
    `   * a schema validator. It does not check that required fields are present,\n` +
    `   * does not reject explicit \`null\` for non-nullable fields, and does not\n` +
    `   * verify cross-field invariants. If the inbound data is untrusted (HTTP\n` +
    `   * body, queue message, third-party API), pre-validate at the boundary —\n` +
    `   * a Zod-based runtime validation pattern is planned for a future release.\n` +
    `   *\n` +
    `   * **Can still throw at the setter.** Even though there's no validation\n` +
    `   * layer, individual setters may throw \`TypeError\` if a value can't be\n` +
    `   * coerced to the declared type (e.g. a non-numeric string for an \`Int\`\n` +
    `   * column). This applies to both the init-shape keys and the\n` +
    `   * prisma-assigned keys (id, createdAt, etc.) that get assigned\n` +
    `   * post-construction. The error includes the field path.\n` +
    `   */\n` +
    `  static from(data: Record<string, unknown>): ${selfIdent} {\n` +
    `${initFilterBlock}` +
    `${prismaAssignedBlock}` +
    `    return instance;\n` +
    `  }\n`
  );
}

function renderToJSONMethod(plans: readonly FieldPlan[]): string | null {
  // Why this is scoped to BigInt: every other type round-trips through
  // JSON.stringify natively. Date has Date.toJSON (ISO string), Decimal has
  // Decimal.toJSON (string form), strings/numbers/booleans/objects are JSON
  // primitives, and Buffer (Bytes) round-trips as JSON itself. BigInt is the
  // single type JS rejects in JSON.stringify ("Do not know how to serialize
  // a BigInt"). Only emit toJSON() when at least one BigInt field exists.
  const bigIntPlans = plans.filter(
    (p) => p.field.type.kind === "scalar" && p.field.type.scalar === "BigInt",
  );
  if (bigIntPlans.length === 0) return null;

  const overrideLines = bigIntPlans.map((p) => {
    const ident = p.ident;
    if (p.field.isList) {
      // List private-field initializer is `= []`, so the list itself is
      // never undefined — mapping is safe with no further guard.
      return `      ${ident}: this.${ident}.map((v) => v.toString()),`;
    }
    if (!p.field.isRequired) {
      // Nullable: tolerate both null (intentional absence) and undefined
      // (unassigned, e.g. pre-construction). JSON.stringify drops undefined
      // keys, matching the pre-toJSON spread behaviour.
      return `      ${ident}: this.${ident} == null ? this.${ident} : this.${ident}.toString(),`;
    }
    // Required: definite-assignment `!` means TS treats it as assigned, but
    // at runtime the field may still be undefined (pre-insert state, no id
    // assigned yet). Guard against undefined so JSON.stringify of a
    // not-yet-saved instance behaves the same way it did before toJSON
    // landed (the field is simply absent from the output).
    return `      ${ident}: this.${ident} === undefined ? undefined : this.${ident}.toString(),`;
  });

  return (
    `  /**\n` +
    `   * JSON-safe view of this instance.\n` +
    `   *\n` +
    `   * BigInt fields are stringified because JSON.stringify throws on bigint\n` +
    `   * natively. Date and Decimal handle their own serialisation via their\n` +
    `   * built-in toJSON() methods. Hidden fields (@hide) are absent because\n` +
    `   * they are not enumerable properties on this instance.\n` +
    `   *\n` +
    `   * The \`this as unknown as Record<string, unknown>\` cast at the spread\n` +
    `   * source is what TS strict mode needs — the class lacks an index\n` +
    `   * signature, so a direct \`{ ...this }\` widening to Record fails. The\n` +
    `   * runtime behaviour is identical; only the type assertion changes.\n` +
    `   */\n` +
    `  toJSON(): Record<string, unknown> {\n` +
    `    return {\n` +
    `      ...(this as unknown as Record<string, unknown>),\n` +
    `${overrideLines.join("\n")}\n` +
    `    };\n` +
    `  }\n`
  );
}

function renderStaticBuilderMethod(selfIdent: string, plans: readonly FieldPlan[]): string | null {
  // No builder if there's nothing writable through UserInit — the resulting
  // class is degenerate and the builder would have no methods.
  const initPlans = plans.filter((p) => p.initFallback.kind !== "prisma-assigned");
  if (initPlans.length === 0) return null;

  return (
    `  /**\n` +
    `   * Fluent builder for ${selfIdent}. One chainable method per init-writable\n` +
    `   * field; \`.build()\` calls the constructor (which fires the full setter\n` +
    `   * pipeline, including any required-field checks).\n` +
    `   */\n` +
    `  static builder(): ${selfIdent}Builder {\n` +
    `    return new ${selfIdent}Builder();\n` +
    `  }\n`
  );
}

function renderBuilderClass(selfIdent: string, plans: readonly FieldPlan[]): string | null {
  // The builder accumulates a Partial<UserInit>; .build() casts that to the
  // strict UserInit shape and constructs. Required-no-default fields that
  // weren't set will surface as `undefined` to the constructor's setter and
  // — for the strict path — store undefined on the private field. We accept
  // that surface for v0.2 to keep the builder ergonomic; the alternative is
  // a runtime-throw with a per-field check, which we'd want only if real
  // consumers hit it. (Static type-checking on the caller side is the primary
  // guard.)
  const initPlans = plans.filter((p) => p.initFallback.kind !== "prisma-assigned");
  if (initPlans.length === 0) return null;

  const methodBlocks = initPlans.map((p) => {
    const inputType = p.decision.setterInputType;
    return (
      `  ${p.ident}(v: ${inputType}): this {\n` +
      `    this.#init.${p.ident} = v;\n` +
      `    return this;\n` +
      `  }`
    );
  });

  return (
    `export class ${selfIdent}Builder {\n` +
    `  readonly #init: Partial<${selfIdent}Init> = {};\n\n` +
    `${methodBlocks.join("\n\n")}\n\n` +
    `  build(): ${selfIdent} {\n` +
    `    return new ${selfIdent}(this.#init as ${selfIdent}Init);\n` +
    `  }\n` +
    `}\n`
  );
}

// Exhaustiveness aid — kept as a soft anchor for future ScalarType additions.
// If Prisma adds a new scalar that requires bespoke handling, the compiler
// won't catch it here, but the type-mapper will fall through to a sensible
// default and coerce-rules will treat it as strict-by-default.
void (null as unknown as ScalarType);
