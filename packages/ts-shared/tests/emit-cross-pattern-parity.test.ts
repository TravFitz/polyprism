// Cross-pattern parity tests.
//
// One realistic fixture, emitted three times — once per declarationStyle —
// with assertions that the ONLY differences are the declaration syntax and
// (for class mode) field-line shape. Everything else — imports, JSDoc,
// field-naming, enum filenames, JSON-type emission — must be identical
// across all three patterns.
//
// These tests are the canary for any future refactor accidentally diverging
// the patterns' code paths.

import {
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  type EnumDef,
  emptyAnnotationSet,
  type FieldDef,
  type GeneratorContext,
  type ModelDef,
  type OmniPrismIR,
  parseAnnotations,
} from "@omniprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

function field(
  name: string,
  fieldType: FieldDef["type"],
  overrides: Partial<FieldDef> = {},
): FieldDef {
  return {
    name,
    dbName: null,
    type: fieldType,
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
    ...overrides,
  };
}

function model(name: string, fields: FieldDef[], overrides: Partial<ModelDef> = {}): ModelDef {
  return {
    name,
    dbName: null,
    documentation: null,
    fields,
    primaryKey: null,
    uniqueIndexes: [],
    indexes: [],
    annotations: emptyAnnotationSet(null),
    ...overrides,
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

// Realistic fixture: one model with relations, an enum, a nullable scalar,
// a list, a JSDoc comment, a Decimal native type, and an @json field.
function buildFixtureIR(): OmniPrismIR {
  return {
    models: [
      model("User", [
        field("id", { kind: "scalar", scalar: "String" }),
        field("email", { kind: "scalar", scalar: "String" }, { isUnique: true }),
        field("nickname", { kind: "scalar", scalar: "String" }, { isRequired: false }),
        field(
          "balance",
          { kind: "scalar", scalar: "Decimal" },
          {
            nativeType: { name: "Decimal", args: ["19", "2"] },
          },
        ),
        field(
          "status",
          { kind: "enum", enumName: "Status" },
          {
            documentation: "Current account status.",
            annotations: {
              ...parseAnnotations("Current account status."),
              documentation: "Current account status.",
            },
          },
        ),
        field("tags", { kind: "scalar", scalar: "String" }, { isList: true }),
        field(
          "metadata",
          { kind: "scalar", scalar: "Json" },
          {
            isRequired: false,
            annotations: parseAnnotations("@json(UserMeta = { theme: string, locale: string })"),
          },
        ),
        field(
          "posts",
          {
            kind: "relation",
            modelName: "Post",
            relationName: null,
            relationFromFields: [],
            relationToFields: [],
            onDelete: null,
            onUpdate: null,
          },
          { isList: true },
        ),
      ]),
      model("Post", [
        field("id", { kind: "scalar", scalar: "String" }),
        field("title", { kind: "scalar", scalar: "String" }),
        field("authorId", { kind: "scalar", scalar: "String" }),
        field("author", {
          kind: "relation",
          modelName: "User",
          relationName: null,
          relationFromFields: ["authorId"],
          relationToFields: ["id"],
          onDelete: null,
          onUpdate: null,
        }),
      ]),
    ],
    enums: [enumDef("Status", ["ACTIVE", "SUSPENDED", "DELETED"])],
  };
}

async function emitAll(ir: OmniPrismIR) {
  const interfaceWriter = createInMemoryFileWriter();
  const typeWriter = createInMemoryFileWriter();
  const classWriter = createInMemoryFileWriter();
  const config = { naming: DEFAULT_NAMING, emitIndex: false };
  await emitModels({ ir, config, outputDir: "/v", writer: interfaceWriter } as GeneratorContext, {
    declarationStyle: "interface",
  });
  await emitModels({ ir, config, outputDir: "/v", writer: typeWriter } as GeneratorContext, {
    declarationStyle: "type",
  });
  await emitModels({ ir, config, outputDir: "/v", writer: classWriter } as GeneratorContext, {
    declarationStyle: "class",
  });
  return {
    interfaceFiles: interfaceWriter.files,
    typeFiles: typeWriter.files,
    classFiles: classWriter.files,
  };
}

describe("cross-pattern parity", () => {
  it("emits the same set of files across all three patterns", async () => {
    const { interfaceFiles, typeFiles, classFiles } = await emitAll(buildFixtureIR());
    const i = [...interfaceFiles.keys()].sort();
    const t = [...typeFiles.keys()].sort();
    const c = [...classFiles.keys()].sort();
    expect(t).toEqual(i);
    expect(c).toEqual(i);
  });

  it("enum files are byte-identical across patterns (enums don't depend on declaration style)", async () => {
    const { interfaceFiles, typeFiles, classFiles } = await emitAll(buildFixtureIR());
    const i = interfaceFiles.get("enums/Status.ts");
    expect(i).toBeDefined();
    expect(typeFiles.get("enums/Status.ts")).toBe(i);
    expect(classFiles.get("enums/Status.ts")).toBe(i);
  });

  it("JSON-type files are byte-identical across patterns", async () => {
    const { interfaceFiles, typeFiles, classFiles } = await emitAll(buildFixtureIR());
    const i = interfaceFiles.get("json-types/UserMeta.ts");
    expect(i).toBeDefined();
    expect(typeFiles.get("json-types/UserMeta.ts")).toBe(i);
    expect(classFiles.get("json-types/UserMeta.ts")).toBe(i);
  });

  it("interface and type modes differ ONLY by the declaration keyword and trailing semicolon", async () => {
    const { interfaceFiles, typeFiles } = await emitAll(buildFixtureIR());
    for (const filename of interfaceFiles.keys()) {
      if (filename.startsWith("enums/") || filename.startsWith("json-types/")) continue;
      const iContent = interfaceFiles.get(filename)!;
      const tContent = typeFiles.get(filename)!;
      // Convert interface output → type output by swapping the keywords.
      const iAsType = iContent
        .replace(/export interface (\w+) \{/g, "export type $1 = {")
        .replace(/^}\n$/m, "};\n");
      expect(tContent).toBe(iAsType);
    }
  });

  it("class and interface modes share imports verbatim (apart from the value-import promotion class mode does for enum defaults — which this fixture avoids)", async () => {
    const { interfaceFiles, classFiles } = await emitAll(buildFixtureIR());
    for (const filename of interfaceFiles.keys()) {
      if (filename.startsWith("enums/") || filename.startsWith("json-types/")) continue;
      const iImports = extractImportBlock(interfaceFiles.get(filename)!);
      const cImports = extractImportBlock(classFiles.get(filename)!);
      // No enum defaults in this fixture → imports must be byte-identical.
      expect(cImports).toBe(iImports);
    }
  });

  it("snapshot: the User model in all three patterns side-by-side", async () => {
    const { interfaceFiles, typeFiles, classFiles } = await emitAll(buildFixtureIR());
    const combined = [
      "// ──── interface ────",
      interfaceFiles.get("User.ts"),
      "// ──── type ────",
      typeFiles.get("User.ts"),
      "// ──── class ────",
      classFiles.get("User.ts"),
    ].join("\n");
    expect(combined).toMatchInlineSnapshot(`
      "// ──── interface ────
      import type { Decimal } from "@prisma/client/runtime/library";
      import type { Status } from "./enums/Status.js";
      import type { UserMeta } from "./json-types/UserMeta.js";
      import type { Post } from "./Post.js";

      export interface User {
        id: string;
        email: string;
        nickname: string | null;
        /**
         * @db.Decimal(19, 2)
         */
        balance: Decimal;
        /**
         * Current account status.
         */
        status: Status;
        tags: string[];
        metadata: UserMeta | null;
        posts: Post[];
      }

      // ──── type ────
      import type { Decimal } from "@prisma/client/runtime/library";
      import type { Status } from "./enums/Status.js";
      import type { UserMeta } from "./json-types/UserMeta.js";
      import type { Post } from "./Post.js";

      export type User = {
        id: string;
        email: string;
        nickname: string | null;
        /**
         * @db.Decimal(19, 2)
         */
        balance: Decimal;
        /**
         * Current account status.
         */
        status: Status;
        tags: string[];
        metadata: UserMeta | null;
        posts: Post[];
      };

      // ──── class ────
      import type { Decimal } from "@prisma/client/runtime/library";
      import type { Status } from "./enums/Status.js";
      import type { UserMeta } from "./json-types/UserMeta.js";
      import type { Post } from "./Post.js";

      export class User {
        id!: string;
        email!: string;
        nickname: string | null = null;
        /**
         * @db.Decimal(19, 2)
         */
        balance!: Decimal;
        /**
         * Current account status.
         */
        status!: Status;
        tags: string[] = [];
        metadata: UserMeta | null = null;
        posts: Post[] = [];
      }
      "
    `);
  });
});

function extractImportBlock(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("import")) out.push(line);
    else if (line === "" && out.length > 0) break;
  }
  return out.join("\n");
}
