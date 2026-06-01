// Tests for Prisma native-type (`@db.X(...)`) JSDoc emission.
//
// The plan says: "Decimal precision attribute: noted in JSDoc but doesn't
// affect TS type (no precision generics in decimal.js)". The IR captures
// `nativeType` for every field that has an explicit `@db.X(...)` attribute;
// render-model surfaces it as an extra JSDoc tag.

import {
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  emptyAnnotationSet,
  type FieldDef,
  type GeneratorContext,
  type ModelDef,
  type NativeType,
} from "@omniprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

function field(
  name: string,
  scalar: "String" | "Decimal" | "Int",
  nativeType: NativeType | null,
  overrides: Partial<FieldDef> = {},
): FieldDef {
  return {
    name,
    dbName: null,
    type: { kind: "scalar", scalar },
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    default: null,
    documentation: null,
    annotations: emptyAnnotationSet(null),
    nativeType,
    ...overrides,
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

function makeContext(models: ModelDef[]) {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: { models, enums: [] },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer,
  };
  return { ctx, writer };
}

describe("nativeType JSDoc emission", () => {
  it("renders @db.Decimal(19, 2) on a Decimal field", async () => {
    const { ctx, writer } = makeContext([
      model("Money", [field("amount", "Decimal", { name: "Decimal", args: ["19", "2"] })]),
    ]);
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("Money.ts")).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";

      export interface Money {
        /**
         * @db.Decimal(19, 2)
         */
        amount: Decimal;
      }
      "
    `);
  });

  it("renders @db.VarChar(2) on a String field", async () => {
    const { ctx, writer } = makeContext([
      model("Address", [field("country", "String", { name: "VarChar", args: ["2"] })]),
    ]);
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("Address.ts")).toMatchInlineSnapshot(`
      "export interface Address {
        /**
         * @db.VarChar(2)
         */
        country: string;
      }
      "
    `);
  });

  it("renders no-arg native types as `@db.Citext` (no parens)", async () => {
    const { ctx, writer } = makeContext([
      model("Tag", [field("slug", "String", { name: "Citext", args: [] })]),
    ]);
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("Tag.ts")).toMatchInlineSnapshot(`
      "export interface Tag {
        /**
         * @db.Citext
         */
        slug: string;
      }
      "
    `);
  });

  it("does not emit any JSDoc block when a field has no nativeType and no other annotations", async () => {
    const { ctx, writer } = makeContext([model("Plain", [field("name", "String", null)])]);
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("Plain.ts")).toMatchInlineSnapshot(`
      "export interface Plain {
        name: string;
      }
      "
    `);
  });

  it("combines documentation, @deprecated, and @db.X tags in a single JSDoc block", async () => {
    const { ctx, writer } = makeContext([
      model("Money", [
        field(
          "amount",
          "Decimal",
          { name: "Decimal", args: ["19", "2"] },
          {
            documentation: "Order total in storefront currency.",
            annotations: {
              hide: false,
              deprecated: { reason: "use cents-based totalCents instead" },
              json: null,
              type: null,
              name: null,
              normalise: null,
              coerce: null,
              documentation: "Order total in storefront currency.",
              rawAnnotations: [],
            },
          },
        ),
      ]),
    ]);
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("Money.ts")).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";

      export interface Money {
        /**
         * Order total in storefront currency.
         * @deprecated use cents-based totalCents instead
         * @db.Decimal(19, 2)
         */
        amount: Decimal;
      }
      "
    `);
  });

  it("nativeType JSDoc renders identically in class mode", async () => {
    const { ctx, writer } = makeContext([
      model("Money", [field("amount", "Decimal", { name: "Decimal", args: ["19", "2"] })]),
    ]);
    await emitModels(ctx, { declarationStyle: "class" });
    expect(writer.files.get("Money.ts")).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";

      export class Money {
        /**
         * @db.Decimal(19, 2)
         */
        amount!: Decimal;
      }
      "
    `);
  });
});
