// Focused tests for declarationStyle: "class" — covers the class-specific
// behaviour (definite-assignment `!`, default-value initializers, null
// defaults for nullable fields, `[] for lists`) and the critical refusal to
// emit a literal default when its kind doesn't match the field scalar — the
// prisma-class-generator integer-default-Date bug we're fixing at the source.

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
} from "@omniprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

interface FieldOverrides {
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  default?: DefaultValue | null;
  annotations?: AnnotationSet;
}

function field(name: string, type: FieldType, o: FieldOverrides = {}): FieldDef {
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
    documentation: null,
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

describe('declarationStyle: "class" — basic shapes', () => {
  it("emits `export class X { ... }` with definite-assignment for required fields without defaults", async () => {
    const { ctx, writer } = makeContext([
      model("User", [field("id", scalar("String")), field("name", scalar("String"))]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        id!: string;
        name!: string;
      }
      "
    `);
  });

  it("nullable scalar field without a default initializes to null", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String")),
        field("nickname", scalar("String"), { isRequired: false }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        id!: string;
        nickname: string | null = null;
      }
      "
    `);
  });

  it("list field initializes to empty array regardless of element type", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String")),
        field("tags", scalar("String"), { isList: true }),
        field("counts", scalar("Int"), { isList: true }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        id!: string;
        tags: string[] = [];
        counts: number[] = [];
      }
      "
    `);
  });
});

describe('declarationStyle: "class" — literal defaults that ARE representable', () => {
  it("emits string default for String field", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("role", scalar("String"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: "member" },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        role: string = "member";
      }
      "
    `);
  });

  it("emits numeric default for Int field", async () => {
    const { ctx, writer } = makeContext([
      model("Counter", [
        field("count", scalar("Int"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 0 },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Counter.ts")).toMatchInlineSnapshot(`
      "export class Counter {
        count: number = 0;
      }
      "
    `);
  });

  it("emits numeric default for Float field", async () => {
    const { ctx, writer } = makeContext([
      model("Item", [
        field("weight", scalar("Float"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 1.5 },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Item.ts")).toMatchInlineSnapshot(`
      "export class Item {
        weight: number = 1.5;
      }
      "
    `);
  });

  it("emits boolean default for Boolean field", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("active", scalar("Boolean"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: true },
        }),
        field("admin", scalar("Boolean"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: false },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        active: boolean = true;
        admin: boolean = false;
      }
      "
    `);
  });

  it("emits enum default as `EnumIdent.VALUE`", async () => {
    const { ctx, writer } = makeContext(
      [
        model("Job", [
          field("status", enumRef("status"), {
            hasDefaultValue: true,
            default: { kind: "literal", value: "PENDING" },
          }),
        ]),
      ],
      [enumDef("status", ["PENDING", "RUNNING", "DONE"])],
    );
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Job.ts")).toMatchInlineSnapshot(`
      "import { Status } from "./enums/Status.js";

      export class Job {
        status: Status = Status.PENDING;
      }
      "
    `);
  });

  it("escapes special characters in string defaults via JSON.stringify", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("bio", scalar("String"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 'has "quotes" and\nnewlines' },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        bio: string = "has \\"quotes\\" and\\nnewlines";
      }
      "
    `);
  });
});

describe('declarationStyle: "class" — function defaults (cuid/uuid/now/autoincrement) fall back to `!`', () => {
  it("emits `!` for required field with cuid() default", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "cuid", args: [] },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export class User {
        id!: string;
      }
      "
    `);
  });

  it("emits `!` for required DateTime with now() default", async () => {
    const { ctx, writer } = makeContext([
      model("Event", [
        field("createdAt", scalar("DateTime"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "now", args: [] },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Event.ts")).toMatchInlineSnapshot(`
      "export class Event {
        createdAt!: Date;
      }
      "
    `);
  });

  it("emits `!` for required Int with autoincrement() default", async () => {
    const { ctx, writer } = makeContext([
      model("Row", [
        field("id", scalar("Int"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "autoincrement", args: [] },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Row.ts")).toMatchInlineSnapshot(`
      "export class Row {
        id!: number;
      }
      "
    `);
  });
});

describe('declarationStyle: "class" — mismatched literal/scalar (the integer-default-Date bug we are NOT replicating)', () => {
  it("refuses to coerce a number-literal default onto a DateTime field — uses `!` instead", async () => {
    // This is the prisma-class-generator bug: an Int @default(90) on a
    // DateTime field got fed to `Date.parse("90")`, yielding NaN-time.
    // OmniPrism must instead fall through to `!`.
    const { ctx, writer } = makeContext([
      model("Quirky", [
        field("notADate", scalar("DateTime"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 90 },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Quirky.ts")!;
    expect(out).not.toContain("Date.parse");
    expect(out).not.toContain("new Date");
    expect(out).toMatchInlineSnapshot(`
      "export class Quirky {
        notADate!: Date;
      }
      "
    `);
  });

  it("refuses to coerce a string-literal default onto a Boolean field", async () => {
    const { ctx, writer } = makeContext([
      model("Quirky", [
        field("flag", scalar("Boolean"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: "yes" },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Quirky.ts")).toMatchInlineSnapshot(`
      "export class Quirky {
        flag!: boolean;
      }
      "
    `);
  });

  it("refuses to coerce a number-literal default onto a BigInt field (would need BigInt() wrap + runtime decision)", async () => {
    const { ctx, writer } = makeContext([
      model("Quirky", [
        field("big", scalar("BigInt"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 100 },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Quirky.ts")).toMatchInlineSnapshot(`
      "export class Quirky {
        big!: bigint;
      }
      "
    `);
  });

  it("refuses to coerce a number-literal default onto a Decimal field", async () => {
    const { ctx, writer } = makeContext([
      model("Money", [
        field("amount", scalar("Decimal"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 0 },
        }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Money.ts")).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";

      export class Money {
        amount!: Decimal;
      }
      "
    `);
  });
});

describe('declarationStyle: "class" — mixed model resembling prisma-class-generator output', () => {
  it("matches the v0.1 spec example output", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "cuid", args: [] },
        }),
        field("email", scalar("String")),
        field("name", scalar("String"), { isRequired: false }),
        field("createdAt", scalar("DateTime"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "now", args: [] },
        }),
        field("balance", scalar("Decimal")),
        field("tags", scalar("String"), { isList: true }),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";

      export class User {
        id!: string;
        email!: string;
        name: string | null = null;
        createdAt!: Date;
        balance!: Decimal;
        tags: string[] = [];
      }
      "
    `);
  });
});

describe('declarationStyle: "class" — barrel re-exports classes as runtime values', () => {
  it("emits `export { Model }` (no `type`) in class mode so consumers can `new Model()`", async () => {
    const writer = createInMemoryFileWriter();
    const ctx: GeneratorContext = {
      ir: {
        models: [model("User", [field("id", scalar("String"))])],
        enums: [enumDef("Role", ["ADMIN"])],
      },
      config: { naming: DEFAULT_NAMING, emitIndex: true },
      outputDir: "/v",
      writer,
    };
    await emitModels(ctx, { declarationStyle: "class" });
    const index = writer.files.get("index.ts")!;
    expect(index).toContain('export { User } from "./User.js"');
    expect(index).not.toContain("export type { User }");
    expect(index).toContain('export { Role } from "./enums/Role.js"');
  });

  it("interface mode still emits `export type { Model }`", async () => {
    const writer = createInMemoryFileWriter();
    const ctx: GeneratorContext = {
      ir: {
        models: [model("User", [field("id", scalar("String"))])],
        enums: [],
      },
      config: { naming: DEFAULT_NAMING, emitIndex: true },
      outputDir: "/v",
      writer,
    };
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("index.ts")).toContain('export type { User } from "./User.js"');
  });
});
