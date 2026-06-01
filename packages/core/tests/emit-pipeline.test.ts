// Integration-style tests: exercise emitEnums + emitJsonTypes against
// the in-memory file writer, using realistic IR shapes built by the
// annotation parser + naming layer.

import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";
import { emitEnums } from "../src/emitter/emit-enums.js";
import { emitJsonTypes } from "../src/emitter/emit-json-types.js";
import { createInMemoryFileWriter } from "../src/emitter/file-writer.js";
import type { GeneratorContext } from "../src/generator/context.js";
import type { EnumDef, FieldDef, ModelDef } from "../src/ir/types.js";
import { emptyAnnotationSet } from "../src/ir/types.js";
import { DEFAULT_NAMING } from "../src/naming/types.js";

function emptyConfig(): GeneratorContext["config"] {
  return { naming: DEFAULT_NAMING, emitIndex: false };
}

function makeContext(args: { models?: readonly ModelDef[]; enums?: readonly EnumDef[] }): {
  ctx: GeneratorContext;
  writer: ReturnType<typeof createInMemoryFileWriter>;
} {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: { models: args.models ?? [], enums: args.enums ?? [] },
    config: emptyConfig(),
    outputDir: "/virtual",
    writer,
  };
  return { ctx, writer };
}

describe("emitEnums", () => {
  it("emits one file per enum under enums/", async () => {
    const { ctx, writer } = makeContext({
      enums: [
        {
          name: "MerchantFlow",
          dbName: null,
          documentation: null,
          values: [
            {
              name: "LEARNING",
              dbName: null,
              documentation: null,
              annotations: emptyAnnotationSet(null),
            },
          ],
          annotations: emptyAnnotationSet(null),
        },
      ],
    });
    await emitEnums(ctx);
    expect([...writer.files.keys()]).toEqual(["enums/MerchantFlow.ts"]);
  });

  it("honours @name override on the filename", async () => {
    const { ctx, writer } = makeContext({
      enums: [
        {
          name: "status",
          dbName: null,
          documentation: "@name(BulkJobStatus)",
          values: [
            {
              name: "PENDING",
              dbName: null,
              documentation: null,
              annotations: emptyAnnotationSet(null),
            },
          ],
          annotations: parseAnnotations("@name(BulkJobStatus)"),
        },
      ],
    });
    await emitEnums(ctx);
    expect([...writer.files.keys()]).toEqual(["enums/BulkJobStatus.ts"]);
  });

  it("skips enums annotated @hide", async () => {
    const { ctx, writer } = makeContext({
      enums: [
        {
          name: "Hidden",
          dbName: null,
          documentation: "@hide",
          values: [
            { name: "X", dbName: null, documentation: null, annotations: emptyAnnotationSet(null) },
          ],
          annotations: parseAnnotations("@hide"),
        },
      ],
    });
    await emitEnums(ctx);
    expect(writer.files.size).toBe(0);
  });

  it("respects fileNaming convention", async () => {
    const writer = createInMemoryFileWriter();
    const ctx: GeneratorContext = {
      ir: {
        models: [],
        enums: [
          {
            name: "MerchantFlow",
            dbName: null,
            documentation: null,
            values: [
              {
                name: "X",
                dbName: null,
                documentation: null,
                annotations: emptyAnnotationSet(null),
              },
            ],
            annotations: emptyAnnotationSet(null),
          },
        ],
      },
      config: { naming: { ...DEFAULT_NAMING, fileNaming: "snake_case" }, emitIndex: false },
      outputDir: "/virtual",
      writer,
    };
    await emitEnums(ctx);
    expect([...writer.files.keys()]).toEqual(["enums/merchant_flow.ts"]);
  });
});

describe("emitJsonTypes", () => {
  function fieldWithJson(name: string, jsonAnnotation: string): FieldDef {
    return {
      name,
      dbName: null,
      type: { kind: "scalar", scalar: "Json" },
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      default: null,
      documentation: jsonAnnotation,
      annotations: parseAnnotations(jsonAnnotation),
      nativeType: null,
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

  it("emits a file for inline-anonymous @json (auto-named)", async () => {
    const { ctx, writer } = makeContext({
      models: [model("User", [fieldWithJson("settings", "@json({ theme: string })")])],
    });
    await emitJsonTypes(ctx);
    expect([...writer.files.keys()]).toEqual(["json-types/UserSettings.ts"]);
    expect(writer.files.get("json-types/UserSettings.ts")).toContain(
      "export type UserSettings = { theme: string };",
    );
  });

  it("emits a file for inline-named @json with explicit name", async () => {
    const { ctx, writer } = makeContext({
      models: [model("Log", [fieldWithJson("payload", "@json(AuditPayload = { actor: string })")])],
    });
    await emitJsonTypes(ctx);
    expect([...writer.files.keys()]).toEqual(["json-types/AuditPayload.ts"]);
    expect(writer.files.get("json-types/AuditPayload.ts")).toContain(
      "export type AuditPayload = { actor: string };",
    );
  });

  it("does not emit files for bare or with-path @json", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("A", [
          fieldWithJson("a", "@json(UserMetadata)"),
          fieldWithJson("b", '@json(BillingAddress from "./types/billing")'),
        ]),
      ],
    });
    await emitJsonTypes(ctx);
    expect(writer.files.size).toBe(0);
  });

  it("dedupes inline-named @json across multiple fields", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("A", [
          fieldWithJson("x", "@json(Shared = { v: number })"),
          fieldWithJson("y", "@json(Shared = { v: number })"),
        ]),
      ],
    });
    await emitJsonTypes(ctx);
    expect(writer.files.size).toBe(1);
  });
});
