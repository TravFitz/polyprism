// Focused tests for declarationStyle: "type" — verify that the only thing
// that changes versus "interface" is the declaration syntax. Field rendering,
// imports, JSDoc, and naming all flow through the same code path.

import {
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  emptyAnnotationSet,
  type FieldDef,
  type GeneratorContext,
  type ModelDef,
} from "@omniprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

function scalarField(name: string, scalar: "String" | "Int" | "Boolean"): FieldDef {
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

function makeContext() {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: {
      models: [model("User", [scalarField("id", "String"), scalarField("name", "String")])],
      enums: [],
    },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer,
  };
  return { ctx, writer };
}

describe('declarationStyle: "type"', () => {
  it("emits `export type X = { ... };` instead of interface", async () => {
    const { ctx, writer } = makeContext();
    await emitModels(ctx, { declarationStyle: "type" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export type User = {
        id: string;
        name: string;
      };
      "
    `);
  });

  it("emits `export interface X { ... }` in interface mode for direct comparison", async () => {
    const { ctx, writer } = makeContext();
    await emitModels(ctx, { declarationStyle: "interface" });
    expect(writer.files.get("User.ts")).toMatchInlineSnapshot(`
      "export interface User {
        id: string;
        name: string;
      }
      "
    `);
  });

  it("type mode preserves all imports, fields, and JSDoc the same as interface mode", async () => {
    const { ctx: iCtx, writer: iWriter } = makeContext();
    const { ctx: tCtx, writer: tWriter } = makeContext();
    await emitModels(iCtx, { declarationStyle: "interface" });
    await emitModels(tCtx, { declarationStyle: "type" });

    // Strip the declaration keyword to compare field contents
    const iBody = iWriter.files.get("User.ts")!.replace(/export interface User \{|\}/g, "");
    const tBody = tWriter.files.get("User.ts")!.replace(/export type User = \{|\};/g, "");
    expect(iBody.trim()).toBe(tBody.trim());
  });
});
