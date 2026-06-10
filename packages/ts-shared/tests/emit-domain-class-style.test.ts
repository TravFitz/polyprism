// Focused tests for declarationStyle: "domain-class" — covers the
// per-instance accessor strategy (Object.defineProperty + enumerable),
// setter-driven @coerce / @normalise behaviour (default-coerce on
// Int/Float/Decimal/BigInt/DateTime; strict elsewhere), and the
// UserInit interface emit. Snapshot-heavy; the generated output is the
// load-bearing contract that shopify-duty-tax will rely on once it
// dogfoods the rc.0.

import {
  type AnnotationSet,
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  type DefaultValue,
  type EnumDef,
  emptyAnnotationSet,
  type FieldDef,
  type FieldType,
  type GeneratorContext,
  type ModelDef,
  parseAnnotations,
} from "@polyprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

interface FieldOverrides {
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  default?: DefaultValue | null;
  annotations?: AnnotationSet;
  documentation?: string;
}

function field(name: string, type: FieldType, o: FieldOverrides = {}): FieldDef {
  const docFromAnnotations = o.annotations?.documentation ?? null;
  return {
    name,
    dbName: null,
    type,
    isList: o.isList ?? false,
    isRequired: o.isRequired ?? true,
    isUnique: false,
    isId: false,
    isUpdatedAt: false,
    hasDefaultValue: o.hasDefaultValue ?? false,
    default: o.default ?? null,
    documentation: o.documentation ?? docFromAnnotations,
    annotations: o.annotations ?? emptyAnnotationSet(null),
    nativeType: null,
  };
}

function scalar(
  s: "String" | "Int" | "Float" | "Boolean" | "DateTime" | "BigInt" | "Decimal" | "Json" | "Bytes",
): FieldType {
  return { kind: "scalar", scalar: s };
}

function enumRef(name: string): FieldType {
  return { kind: "enum", enumName: name };
}

function relation(modelName: string): FieldType {
  return {
    kind: "relation",
    modelName,
    relationName: null,
    relationFromFields: [],
    relationToFields: [],
    onDelete: null,
    onUpdate: null,
  };
}

function model(name: string, fields: FieldDef[]): ModelDef {
  return {
    name,
    dbName: null,
    documentation: null,
    fields,
    primaryKey: null,
    uniqueIndexes: [],
    indexes: [],
    annotations: emptyAnnotationSet(null),
  };
}

function enumDef(name: string, values: string[]): EnumDef {
  return {
    name,
    dbName: null,
    documentation: null,
    values: values.map((v) => ({
      name: v,
      dbName: null,
      documentation: null,
      annotations: emptyAnnotationSet(null),
    })),
    annotations: emptyAnnotationSet(null),
  };
}

function makeContext(models: ModelDef[], enums: EnumDef[] = []) {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: { models, enums },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer,
  };
  return { ctx, writer };
}

const cuidDefault = (): DefaultValue => ({ kind: "function", name: "cuid", args: [] });
const nowDefault = (): DefaultValue => ({ kind: "function", name: "now", args: [] });
const litInt = (v: number): DefaultValue => ({ kind: "literal", value: v });
const litStr = (v: string): DefaultValue => ({ kind: "literal", value: v });
const litBool = (v: boolean): DefaultValue => ({ kind: "literal", value: v });

describe('declarationStyle: "domain-class" — overall shape', () => {
  it("emits a UserInit interface + class with private fields, class accessors, enumerable-shim loop, and init assignment", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), {
          hasDefaultValue: true,
          default: cuidDefault(),
          isRequired: true,
        }),
        field("email", scalar("String")),
        field("name", scalar("String"), { isRequired: false }),
        field("points", scalar("Int"), { hasDefaultValue: true, default: litInt(0) }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts");
    expect(out).toBeDefined();
    // High-signal substring assertions — full output is snapshot-tested
    // elsewhere so a small naming tweak doesn't churn 50 snapshots.
    expect(out).toContain("export interface UserInit");
    expect(out).toContain("export class User");
    expect(out).toContain("#email!: string;");
    expect(out).toContain("#name: string | null = null;");
    expect(out).toContain("#points!: number;");
    // Class accessors (prototype-level) — TS sees these with asymmetric types
    expect(out).toContain("get email(): string {");
    expect(out).toContain("set email(v: string) {");
    expect(out).toContain("get points(): number {");
    expect(out).toContain("set points(v: number | string) {");
    // The per-instance enumerable shim — what makes Prisma read the fields
    expect(out).toContain("Object.getOwnPropertyDescriptor(User.prototype, key)");
    expect(out).toContain("enumerable: true");
    // Init assignment
    expect(out).toContain("this.email = init.email;");
    expect(out).toContain("this.points = init.points ?? 0;");
    expect(out).toContain("if (init.name !== undefined) this.name = init.name;");
    // id has a function default (cuid()) → not in UserInit, not assigned
    expect(out).not.toContain("init.id");
  });
});

describe('declarationStyle: "domain-class" — coerce by default', () => {
  it("coerces Int by default (setter accepts number | string)", async () => {
    const { ctx, writer } = makeContext([model("M", [field("count", scalar("Int"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain('import { coerceInt } from "@polyprism/runtime";');
    expect(out).toContain("set count(v: number | string) {");
    expect(out).toContain('this.#count = coerceInt(v, "M.count");');
  });

  it("coerces Float by default", async () => {
    const { ctx, writer } = makeContext([model("M", [field("ratio", scalar("Float"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("coerceFloat");
    expect(out).toContain('this.#ratio = coerceFloat(v, "M.ratio");');
  });

  it("coerces Decimal by default (inlined; imports Decimal as value)", async () => {
    const { ctx, writer } = makeContext([model("M", [field("total", scalar("Decimal"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain('import { Decimal } from "@prisma/client/runtime/library";');
    expect(out).toContain("set total(v: Decimal | number | string) {");
    expect(out).toContain("this.#total = (v instanceof Decimal ? v : new Decimal(v));");
    // Decimal does NOT come from @polyprism/runtime — it stays Prisma-sourced.
    expect(out).not.toContain("coerceDecimal");
  });

  it("coerces BigInt by default", async () => {
    const { ctx, writer } = makeContext([model("M", [field("counter", scalar("BigInt"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("coerceBigInt");
    expect(out).toContain("set counter(v: bigint | number | string) {");
  });

  it("coerces DateTime by default", async () => {
    const { ctx, writer } = makeContext([model("M", [field("at", scalar("DateTime"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("coerceDate");
    expect(out).toContain("set at(v: Date | string | number) {");
  });
});

describe('declarationStyle: "domain-class" — strict by default', () => {
  it("does not coerce String fields", async () => {
    const { ctx, writer } = makeContext([model("M", [field("title", scalar("String"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set title(v: string) {");
    expect(out).toContain("this.#title = v;");
    expect(out).not.toContain("@polyprism/runtime");
  });

  it("does not coerce Boolean fields", async () => {
    const { ctx, writer } = makeContext([model("M", [field("flag", scalar("Boolean"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set flag(v: boolean) {");
    expect(out).toContain("this.#flag = v;");
  });

  it("does not coerce enum fields", async () => {
    const { ctx, writer } = makeContext(
      [
        model("M", [
          field("role", enumRef("Role"), {
            hasDefaultValue: true,
            default: litStr("ADMIN"),
          }),
        ]),
      ],
      [enumDef("Role", ["ADMIN", "MEMBER"])],
    );
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set role(v: Role) {");
    expect(out).toContain("this.#role = v;");
    // Default value promotes Role import to value form
    expect(out).toContain('import { Role } from "./enums/Role.js";');
    expect(out).toContain("this.role = init.role ?? Role.ADMIN;");
  });

  it("does not coerce relation fields", async () => {
    const { ctx, writer } = makeContext([
      model("Post", [field("author", relation("User"))]),
      model("User", [field("id", scalar("String"))]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Post.ts")!;
    expect(out).toContain("set author(v: User) {");
    expect(out).toContain("this.#author = v;");
  });

  it("does not coerce Json fields", async () => {
    const { ctx, writer } = makeContext([model("M", [field("blob", scalar("Json"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set blob(v: JsonValue) {");
    expect(out).toContain("this.#blob = v;");
  });

  it("does not coerce Bytes fields", async () => {
    const { ctx, writer } = makeContext([model("M", [field("payload", scalar("Bytes"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set payload(v: Uint8Array) {");
  });
});

describe('declarationStyle: "domain-class" — @noCoerce opt-out', () => {
  it("flips Int default-coerce to strict", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("internalSeq", scalar("Int"), {
          annotations: parseAnnotations("@noCoerce"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set internalSeq(v: number) {");
    expect(out).toContain("this.#internalSeq = v;");
    expect(out).not.toContain("coerceInt");
  });

  it("flips Decimal default-coerce to strict (no Decimal value import)", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("amount", scalar("Decimal"), {
          annotations: parseAnnotations("@noCoerce"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    // Decimal is still imported (for the type), but as type-only:
    expect(out).toContain('import type { Decimal } from "@prisma/client/runtime/library";');
    expect(out).toContain("set amount(v: Decimal) {");
    expect(out).toContain("this.#amount = v;");
  });
});

describe('declarationStyle: "domain-class" — @coerce(target) cross-type override', () => {
  it("coerces stringified-int columns when @coerce(int) is on a String field", async () => {
    const { ctx, writer } = makeContext([
      model("Legacy", [
        field("countStr", scalar("String"), {
          annotations: parseAnnotations("@coerce(int)"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Legacy.ts")!;
    // Setter accepts the widened-for-int input (declared `string` is already in
    // the union, no duplication of `string`).
    expect(out).toContain("set countStr(v: number | string) {");
    expect(out).toContain('this.#countStr = coerceInt(v, "Legacy.countStr");');
  });
});

describe('declarationStyle: "domain-class" — @normalise', () => {
  it("emits normalise() for trim+lowercase on a String field", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("email", scalar("String"), {
          annotations: parseAnnotations("@normalise(trim, lowercase)"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain('import { normalise } from "@polyprism/runtime";');
    expect(out).toContain('this.#email = normalise(v, ["trim","lowercase"] as const);');
  });

  it("emits normaliseNullable() for a nullable String field", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("email", scalar("String"), {
          isRequired: false,
          annotations: parseAnnotations("@normalise(trim, lowercase, nullEmptyToNull)"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("normaliseNullable");
    expect(out).toContain("this.#email = v === null ? null : normaliseNullable(v,");
  });
});

describe('declarationStyle: "domain-class" — nullable widening', () => {
  it("widens setter input to include null on nullable coerce-by-default fields", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("points", scalar("Int"), { isRequired: false })]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("set points(v: number | string | null) {");
    expect(out).toContain('this.#points = v === null ? null : coerceInt(v, "M.points");');
  });
});

describe('declarationStyle: "domain-class" — UserInit shape', () => {
  it("required-no-default field is required in Init", async () => {
    const { ctx, writer } = makeContext([model("M", [field("email", scalar("String"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toMatch(/export interface MInit \{\s+email: string;/);
  });

  it("required-with-literal-default field is optional in Init", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("count", scalar("Int"), { hasDefaultValue: true, default: litInt(0) })]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toMatch(/count\?: number \| string;/);
  });

  it("nullable field is optional in Init", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("name", scalar("String"), { isRequired: false })]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toMatch(/name\?: string \| null;/);
  });

  it("function-default field (cuid/now) is excluded from Init entirely", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("createdAt", scalar("DateTime"), { hasDefaultValue: true, default: nowDefault() }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).not.toMatch(/id\?:/);
    expect(out).not.toMatch(/createdAt\?:/);
  });

  it("hidden field is excluded from Init AND the class", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("email", scalar("String")),
        field("passwordHash", scalar("String"), {
          annotations: parseAnnotations("@hide"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).not.toContain("passwordHash");
  });
});

describe('declarationStyle: "domain-class" — list handling', () => {
  it("emits `= []` as the private field initializer and a strict setter", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("tags", scalar("String"), { isList: true })]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("#tags: string[] = [];");
    expect(out).toContain("set tags(v: string[]) {");
    expect(out).toContain("this.#tags = v;");
  });
});

describe('declarationStyle: "domain-class" — JSDoc on getter', () => {
  it("emits @deprecated tag above the accessor block", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("oldField", scalar("String"), {
          annotations: parseAnnotations('@deprecated("use newField instead")'),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("M.ts")!;
    expect(out).toContain("@deprecated use newField instead");
  });
});

describe('declarationStyle: "domain-class" — barrel index integration', () => {
  it("emits value-form export when emitIndex is enabled", async () => {
    const writer = createInMemoryFileWriter();
    const ctx: GeneratorContext = {
      ir: { models: [model("User", [field("id", scalar("String"))])], enums: [] },
      config: { naming: DEFAULT_NAMING, emitIndex: true },
      outputDir: "/v",
      writer,
    };
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const indexFile = writer.files.get("index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile).toContain('export { User } from "./User.js";');
    expect(indexFile).not.toContain("export type { User }");
  });
});

describe('declarationStyle: "domain-class" — Prisma-friendly accessor surface', () => {
  it("emits the per-instance enumerable-shim loop so Object.keys returns all fields (the Prisma read path)", async () => {
    const { ctx, writer } = makeContext([
      model("Shop", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("name", scalar("String")),
        field("active", scalar("Boolean"), { hasDefaultValue: true, default: litBool(true) }),
        field("languageSettings", scalar("Json")),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Shop.ts")!;
    // The constructor must republish each prototype accessor as an enumerable
    // own property — that's what makes `prisma.shop.update({ data: instance })`
    // see the field names via Object.keys / Object.entries.
    expect(out).toContain(
      'for (const key of ["id", "name", "active", "languageSettings"] as const)',
    );
    expect(out).toContain("Object.getOwnPropertyDescriptor(Shop.prototype, key)");
    expect(out).toContain("Object.defineProperty(this, key, { ...desc, enumerable: true })");
  });
});

describe('declarationStyle: "domain-class" — strict nullable setter has no null-wrap', () => {
  it("emits a bare `this.#x = v;` for nullable strict relations (no `v === null ? null : v` cosmetic wrap)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("parentOrder", relation("Order"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    // The null-wrap is unnecessary cosmetic dead code when there's no coerce
    // or normalise to skip on null input — the setter is a pure pass-through.
    expect(out).toContain("this.#parentOrder = v;");
    expect(out).not.toContain("this.#parentOrder = v === null ? null : v");
  });

  it("STILL wraps nullable coerce fields (the wrap stops coerceX from being called with null)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [field("paidAt", scalar("DateTime"), { isRequired: false })]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain('this.#paidAt = v === null ? null : coerceDate(v, "Order.paidAt");');
  });

  it("STILL wraps nullable string fields with @normalise (so normalise call isn't fired on null)", async () => {
    const { ctx, writer } = makeContext([
      model("Customer", [
        field("vatNumber", scalar("String"), {
          isRequired: false,
          annotations: { ...emptyAnnotationSet(null), normalise: ["trim"] },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Customer.ts")!;
    // normaliseNullable already handles null internally — but the outer guard
    // still wraps because hasRuntimeWork is true (normaliseOps.length > 0).
    expect(out).toContain("normaliseNullable");
  });
});

describe('declarationStyle: "domain-class" — prisma-assigned getter @remarks', () => {
  it("emits an @remarks JSDoc tag on required+prisma-assigned getters so IDE hovers surface the pre-insert contract", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("BigInt"), {
          hasDefaultValue: true,
          // autoincrement is a function default, treated as prisma-assigned
          default: { kind: "function", name: "autoincrement", args: [] },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toMatch(/@remarks Prisma-assigned at insert time/);
    expect(out).toContain("freshly-constructed instance");
    expect(out).toContain("undefined");
  });

  it("does NOT emit the @remarks tag on required+literal-default fields (constructor coalesces those)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("status", scalar("String"), {
          hasDefaultValue: true,
          default: litStr("PENDING"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).not.toContain("@remarks Prisma-assigned");
  });

  it("DOES emit the @remarks tag on nullable+prisma-assigned fields (they share the pre-insert undefined contract with required+prisma-assigned)", async () => {
    // Updated contract after the nullable+function-default null-clobber fix:
    // nullable + `@default(now()/cuid()/etc)` fields now leave the private
    // slot `!` (definite-assignment, pre-insert undefined) so Prisma's
    // schema default fires instead of being explicit-null-clobbered. They
    // therefore share the pre-insert undefined contract with required
    // prisma-assigned fields and deserve the same JSDoc surfacing.
    const { ctx, writer } = makeContext([
      model("Order", [
        field("dateCreated", scalar("DateTime"), {
          isRequired: false,
          hasDefaultValue: true,
          default: nowDefault(),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toMatch(/@remarks Prisma-assigned at insert time/);
  });
});

describe('declarationStyle: "domain-class" — nullable + default truth gap', () => {
  it("uses `!` (definite-assignment) for nullable+function-default — NOT `= null` — so Prisma's @default fires instead of being null-clobbered", async () => {
    // `dateCreated DateTime? @default(now())` — prisma-assigned. The private
    // slot must stay `undefined` pre-insert so Prisma's data: channel sees
    // an absent field and fires the schema default. Initialising to null
    // would cause Prisma to write NULL (explicit-null means "force null,
    // ignore default" in Prisma's contract), silently defeating @default(now()).
    //
    // This test gates a real regression: an earlier "ALL nullable fields
    // initialise to null" rule was set with the well-meaning goal of making
    // the runtime value match the declared `T | null` type, but it caused
    // production data loss for any model using nullable + function-default.
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("dateCreated", scalar("DateTime"), {
          isRequired: false,
          hasDefaultValue: true,
          default: nowDefault(),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain("#dateCreated!: Date | null;");
    expect(out).not.toContain("#dateCreated: Date | null = null;");
    // The pre-insert undefined contract is surfaced via @remarks JSDoc so
    // consumers know the declared type is post-insert-honest.
    expect(out).toMatch(/@remarks Prisma-assigned at insert time/);
  });

  it("STILL initialises nullable+no-default to `= null` (user wants null when unset, no schema default to defeat)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("notes", scalar("String"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain("#notes: string | null = null;");
  });

  it("applies a nullable+literal-default value when init.field is undefined", async () => {
    // `orderSyncStatus String? @default("INCOMPLETE")` — the literal default
    // must fire when init lacks the field. Previously the nullable branch
    // skipped assignment entirely, so the default was effectively dropped.
    const { ctx, writer } = makeContext([
      model("Order", [
        field("orderSyncStatus", scalar("String"), {
          isRequired: false,
          hasDefaultValue: true,
          default: litStr("INCOMPLETE"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain(
      'this.orderSyncStatus = init.orderSyncStatus !== undefined ? init.orderSyncStatus : "INCOMPLETE";',
    );
    expect(out).toContain("#orderSyncStatus: string | null = null;");
  });

  it("preserves explicit null when init.field is null (does not replace with default)", async () => {
    // Conceptually: `new Order({ orderSyncStatus: null })` should store null,
    // NOT replace with the default. The `!== undefined` check guarantees this
    // (a `??` would clobber explicit null with the default value).
    const { ctx, writer } = makeContext([
      model("Order", [
        field("orderSyncStatus", scalar("String"), {
          isRequired: false,
          hasDefaultValue: true,
          default: litStr("INCOMPLETE"),
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    // The `?? default` form would silently replace explicit null; ensure
    // we're using the `!== undefined ? init : default` form instead.
    expect(out).not.toContain("init.orderSyncStatus ?? ");
  });
});

describe('declarationStyle: "domain-class" — reserved-name collision', () => {
  it("rejects a field whose ident is 'constructor' (would break instance.constructor reflection)", async () => {
    // The renderer drops the offending field from the class body AND records
    // an error-severity Diagnostic with `Model.field` context. With the v0.2
    // diagnostic surface (onDiagnostic + throw-on-error), emitModels throws
    // at the end — silently dropping the field while pretending the build
    // succeeded was the old footgun. Tests now assert on both the
    // diagnostic and the throw.
    const { ctx } = makeContext([
      model("Conflict", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("constructor", scalar("String")),
        field("name", scalar("String")),
      ]),
    ]);
    const diagnostics: Array<{ severity: string; context: string; message: string }> = [];
    await expect(
      emitModels(ctx, {
        declarationStyle: "domain-class",
        onDiagnostic: (d) => diagnostics.push(d),
      }),
    ).rejects.toThrow(/error-severity diagnostic/);

    const issue = diagnostics.find((d) => d.context === "Conflict.constructor");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("collides with a built-in prototype property");
  });

  it("rejects a field whose ident is '__proto__' (descriptor is inherited, not own — Prisma would never see it)", async () => {
    const { ctx } = makeContext([
      model("Conflict", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("__proto__", scalar("String")),
      ]),
    ]);
    const diagnostics: Array<{ severity: string; context: string; message: string }> = [];
    await expect(
      emitModels(ctx, {
        declarationStyle: "domain-class",
        onDiagnostic: (d) => diagnostics.push(d),
      }),
    ).rejects.toThrow(/error-severity diagnostic/);

    const issue = diagnostics.find((d) => d.context === "Conflict.__proto__");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });
});

describe('declarationStyle: "domain-class" — static from()', () => {
  it("emits a static from() that filters to known init keys and constructs via the constructor", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("email", scalar("String")),
        field("name", scalar("String"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts")!;
    expect(out).toContain("static from(data: Record<string, unknown>): User {");
    // init keys are the non-prisma-assigned ones — id (cuid) is excluded
    expect(out).toContain('const initKeys = ["email", "name"] as const;');
    expect(out).toContain("const instance = new User(init as unknown as UserInit);");
    expect(out).toContain("return instance;");
  });

  it("assigns prisma-assigned fields post-construction so hydrated rows preserve their server-side ids/timestamps", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("email", scalar("String")),
        field("createdAt", scalar("DateTime"), { hasDefaultValue: true, default: nowDefault() }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts")!;
    expect(out).toContain('const assignKeys = ["id", "createdAt"] as const;');
    expect(out).toContain("(instance as unknown as Record<string, unknown>)[key] = data[key];");
  });

  it("does not emit an assignKeys block when no field is prisma-assigned", async () => {
    const { ctx, writer } = makeContext([
      model("Settings", [field("key", scalar("String")), field("value", scalar("String"))]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Settings.ts")!;
    expect(out).toContain("static from(data: Record<string, unknown>): Settings {");
    expect(out).not.toContain("assignKeys");
  });
});

describe('declarationStyle: "domain-class" — toJSON()', () => {
  it("does NOT emit toJSON() on models without a BigInt field (native serialisation suffices)", async () => {
    const { ctx, writer } = makeContext([
      model("Plain", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("name", scalar("String")),
        field("createdAt", scalar("DateTime"), { hasDefaultValue: true, default: nowDefault() }),
        field("price", scalar("Decimal")),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Plain.ts")!;
    expect(out).not.toContain("toJSON()");
  });

  it("emits toJSON() that stringifies a single BigInt field", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("BigInt"), { hasDefaultValue: true, default: cuidDefault() }),
        field("amount", scalar("Decimal")),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain("toJSON(): Record<string, unknown> {");
    expect(out).toContain("...(this as unknown as Record<string, unknown>),");
    expect(out).toContain("id: this.id === undefined ? undefined : this.id.toString(),");
  });

  it("emits the nullable BigInt branch (tolerates both null and undefined)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("BigInt"), { hasDefaultValue: true, default: cuidDefault() }),
        field("parentOrderId", scalar("BigInt"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain(
      "parentOrderId: this.parentOrderId == null ? this.parentOrderId : this.parentOrderId.toString(),",
    );
  });

  it("emits the BigInt-list branch (map each element through toString)", async () => {
    const { ctx, writer } = makeContext([
      model("Audit", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("eventIds", scalar("BigInt"), { isList: true }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Audit.ts")!;
    expect(out).toContain("eventIds: this.eventIds.map((v) => v.toString()),");
  });
});

describe('declarationStyle: "domain-class" — builder()', () => {
  it("emits a static builder() returning ModelBuilder", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("email", scalar("String")),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts")!;
    expect(out).toContain("static builder(): UserBuilder {");
    expect(out).toContain("return new UserBuilder();");
  });

  it("emits a sibling UserBuilder class with one chainable method per init-writable field", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("email", scalar("String")),
        field("points", scalar("Int"), { hasDefaultValue: true, default: litInt(0) }),
        field("createdAt", scalar("DateTime"), { hasDefaultValue: true, default: nowDefault() }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts")!;
    expect(out).toContain("export class UserBuilder {");
    expect(out).toContain("readonly #init: Partial<UserInit> = {};");
    // email is required-no-default — present
    expect(out).toContain("email(v: string): this {");
    // points is Int + default → coerce-by-default widening
    expect(out).toContain("points(v: number | string): this {");
    // id is prisma-assigned (cuid) → must NOT have a builder method
    expect(out).not.toMatch(/^\s*id\(v:/m);
    // createdAt is prisma-assigned (now) → must NOT have a builder method
    expect(out).not.toMatch(/^\s*createdAt\(v:/m);
  });

  it("emits build() that returns the model and casts the partial init", async () => {
    const { ctx, writer } = makeContext([model("User", [field("email", scalar("String"))])]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("User.ts")!;
    expect(out).toContain("build(): User {");
    expect(out).toContain("return new User(this.#init as UserInit);");
  });

  it("builder method input type widens the same way the constructor setter does (nullable coerce field gets `| null`)", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
        field("paidAt", scalar("DateTime"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Order.ts")!;
    expect(out).toContain("paidAt(v: Date | string | number | null): this {");
  });
});

describe('declarationStyle: "domain-class" — relation field hydration', () => {
  // Bug A: required-relation slots are only populated when the caller
  // `include`d the relation in their Prisma query. Treating them as
  // always-present scalars silently wrote `undefined` to the private slot
  // (via the unguarded `this.X = init.X` constructor line) while leaving
  // the getter typed `T` (non-null) — a silent TS lie.
  describe("Bug A — required-relation constructor + UserInit + getter", () => {
    it("makes required relations OPTIONAL in UserInit (`store?: Store;`)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("storeHash", scalar("String")), field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("store?: Store;");
      // The required scalar stays required (no `?`).
      expect(out).toContain("storeHash: string;");
    });

    it("guards the constructor assignment with `if (init.store !== undefined)`", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("if (init.store !== undefined) this.store = init.store;");
      expect(out).not.toMatch(/^\s*this\.store = init\.store;\s*$/m);
    });

    it("widens the getter return type to `T | undefined` for required single relations", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("get store(): Store | undefined {");
      // Setter stays narrow — caller writing to the slot already has it.
      expect(out).toContain("set store(v: Store) {");
      // Private field carries the widened type and an explicit undefined init.
      expect(out).toContain("#store: Store | undefined = undefined;");
    });

    it("does NOT widen required SCALAR getters (only relations)", async () => {
      const { ctx, writer } = makeContext([model("M", [field("name", scalar("String"))])]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("M.ts")!;
      expect(out).toContain("get name(): string {");
      expect(out).not.toContain("get name(): string | undefined");
    });

    it("does NOT widen nullable-relation getters (already honest)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("parentOrder", relation("Order"), { isRequired: false })]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("get parentOrder(): Order | null {");
      expect(out).not.toContain("Order | null | undefined");
    });

    it("does NOT widen LIST relation getters (the `= []` initializer is honest)", async () => {
      const { ctx, writer } = makeContext([
        model("User", [field("posts", relation("Post"), { isList: true })]),
        model("Post", [field("id", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("User.ts")!;
      expect(out).toContain("get posts(): Post[] {");
      expect(out).not.toContain("Post[] | undefined");
    });
  });

  // Bug B: Prisma returns included relations as plain sub-row objects, not as
  // instances of the related class. `from()` must recursively hydrate so
  // consumers get real instances (correct `instanceof`, working methods,
  // setter coerce/normalise actually running).
  describe("Bug B — from() recursively hydrates included relations", () => {
    it("hydrates included single relations via `RelType.from()`", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("if (init.store !== undefined && init.store !== null) {");
      expect(out).toContain("init.store = init.store instanceof Store");
      expect(out).toContain("Store.from(init.store as Record<string, unknown>);");
    });

    it("hydrates included LIST relations via `.map(RelType.from)`", async () => {
      const { ctx, writer } = makeContext([
        model("User", [field("posts", relation("Post"), { isList: true })]),
        model("Post", [field("id", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("User.ts")!;
      expect(out).toContain("if (Array.isArray(init.posts)) {");
      expect(out).toContain("init.posts = init.posts.map((v) =>");
      expect(out).toContain("v instanceof Post ? v : Post.from(v as Record<string, unknown>),");
    });

    it("is idempotent for already-hydrated single relations (instanceof check passes through)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      // The ternary form must keep the existing instance untouched.
      expect(out).toMatch(/init\.store instanceof Store\s*\n\s*\?\s*init\.store/);
    });

    it("does NOT hydrate scalar / enum fields (no `.from` calls except for relations)", async () => {
      const { ctx, writer } = makeContext(
        [
          model("M", [
            field("name", scalar("String")),
            field("count", scalar("Int")),
            field("role", enumRef("Role")),
          ]),
        ],
        [enumDef("Role", ["MEMBER"])],
      );
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("M.ts")!;
      // The general init-filter is the only place `.from` could appear; with
      // no relation fields, the hydration block is empty.
      expect(out).not.toMatch(/\.from\(init\.\w+/);
    });

    it("works for self-referential relations (no import needed; class is in scope)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [
          field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
          field("parentOrder", relation("Order"), { isRequired: false }),
        ]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      expect(out).toContain("init.parentOrder instanceof Order");
      expect(out).toContain("Order.from(init.parentOrder as Record<string, unknown>);");
      // No self-import line.
      expect(out).not.toMatch(/from "\.\/Order\.js"/);
    });

    it("promotes the relation class import from type-only to value (so `instanceof` + `.from` work at runtime)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [field("store", relation("Store"))]),
        model("Store", [field("hash", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      // No `import type { Store }` — must be a value import.
      expect(out).not.toContain("import type { Store }");
      expect(out).toContain("import { Store }");
    });
  });

  describe("nullable + list edge cases", () => {
    it("preserves `null` for nullable single relations (single-relation guard skips when value is null)", async () => {
      const { ctx, writer } = makeContext([
        model("Order", [
          field("id", scalar("String")),
          field("parentOrder", relation("Order"), { isRequired: false }),
        ]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Order.ts")!;
      // The `!== null` guard is what keeps the null path from calling
      // `Order.from(null)` (which would crash on `null as Record<...>`).
      expect(out).toContain("if (init.parentOrder !== undefined && init.parentOrder !== null) {");
    });

    it("uses `Array.isArray()` rather than `!== undefined` for list relations (no crash on a non-array value)", async () => {
      const { ctx, writer } = makeContext([
        model("User", [field("posts", relation("Post"), { isList: true })]),
        model("Post", [field("id", scalar("String"))]),
      ]);
      await emitModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("User.ts")!;
      expect(out).toContain("if (Array.isArray(init.posts)) {");
    });
  });
});
