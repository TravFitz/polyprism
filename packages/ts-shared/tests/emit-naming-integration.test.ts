// Three-axis naming integration tests.
//
// The naming layer's resolver/casing functions are exhaustively unit-tested
// in core/tests/naming.test.ts. These tests sit one level higher: they emit
// the *same* schema under different combined (fileNaming × typeNaming ×
// fieldNaming) settings and assert that all three axes propagate through to
// the actual filenames, type identifiers, import paths, enum filenames, and
// field names in a single coherent generation pass.

import {
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  type EnumDef,
  emptyAnnotationSet,
  type FieldDef,
  type GeneratorContext,
  type ModelDef,
  type NamingConfig,
  type PolyPrismIR,
} from "@polyprism/core";
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

// Fixture: schema names are PascalCase model / lowercase fields / PascalCase
// enum. Each axis gets a distinct convention so it's obvious which axis
// drives which part of the output.
function buildIR(): PolyPrismIR {
  return {
    models: [
      model("UserProfile", [
        field("displayName", { kind: "scalar", scalar: "String" }),
        field("emailAddress", { kind: "scalar", scalar: "String" }),
        field("currentStatus", { kind: "enum", enumName: "AccountStatus" }),
      ]),
    ],
    enums: [enumDef("AccountStatus", ["ACTIVE", "SUSPENDED"])],
  };
}

async function emitWith(naming: NamingConfig) {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: buildIR(),
    config: { naming, emitIndex: true },
    outputDir: "/v",
    writer,
  };
  await emitModels(ctx, { declarationStyle: "interface" });
  return writer.files;
}

describe("three-axis naming integration — all defaults (PascalCase / PascalCase / preserve)", () => {
  it("emits PascalCase filenames, PascalCase identifiers, preserve fields", async () => {
    const files = await emitWith(DEFAULT_NAMING);
    expect([...files.keys()].sort()).toEqual(
      ["UserProfile.ts", "enums/AccountStatus.ts", "index.ts"].sort(),
    );
    expect(files.get("UserProfile.ts")).toMatchInlineSnapshot(`
      "import type { AccountStatus } from "./enums/AccountStatus.js";

      export interface UserProfile {
        displayName: string;
        emailAddress: string;
        currentStatus: AccountStatus;
      }
      "
    `);
  });
});

describe("three-axis naming integration — snake_case files, PascalCase types, snake_case fields", () => {
  it("filenames + import paths use snake_case; type names stay PascalCase; fields → snake_case", async () => {
    const files = await emitWith({
      fileNaming: "snake_case",
      typeNaming: "PascalCase",
      fieldNaming: "snake_case",
    });
    expect([...files.keys()].sort()).toEqual(
      ["user_profile.ts", "enums/account_status.ts", "index.ts"].sort(),
    );
    expect(files.get("user_profile.ts")).toMatchInlineSnapshot(`
      "import type { AccountStatus } from "./enums/account_status.js";

      export interface UserProfile {
        display_name: string;
        email_address: string;
        current_status: AccountStatus;
      }
      "
    `);
  });
});

describe("three-axis naming integration — kebab-case files, camelCase types, preserve fields", () => {
  it("filenames + import paths use kebab-case; type names get camelCase; fields untouched", async () => {
    const files = await emitWith({
      fileNaming: "kebab-case",
      typeNaming: "camelCase",
      fieldNaming: "preserve",
    });
    expect([...files.keys()].sort()).toEqual(
      ["user-profile.ts", "enums/account-status.ts", "index.ts"].sort(),
    );
    expect(files.get("user-profile.ts")).toMatchInlineSnapshot(`
      "import type { accountStatus } from "./enums/account-status.js";

      export interface userProfile {
        displayName: string;
        emailAddress: string;
        currentStatus: accountStatus;
      }
      "
    `);
  });
});

describe("three-axis naming integration — barrel honours all three axes", () => {
  it("snake_case barrel re-exports use snake_case paths AND PascalCase identifiers", async () => {
    const files = await emitWith({
      fileNaming: "snake_case",
      typeNaming: "PascalCase",
      fieldNaming: "snake_case",
    });
    expect(files.get("index.ts")).toMatchInlineSnapshot(`
      "export type { UserProfile } from "./user_profile.js";
      export { AccountStatus } from "./enums/account_status.js";
      "
    `);
  });

  it("kebab-case barrel re-exports use kebab-case paths AND camelCase identifiers", async () => {
    const files = await emitWith({
      fileNaming: "kebab-case",
      typeNaming: "camelCase",
      fieldNaming: "preserve",
    });
    expect(files.get("index.ts")).toMatchInlineSnapshot(`
      "export type { userProfile } from "./user-profile.js";
      export { accountStatus } from "./enums/account-status.js";
      "
    `);
  });
});

describe("three-axis naming integration — preserve mode is truly a no-op", () => {
  it("all-preserve keeps schema names verbatim across files, identifiers, and fields", async () => {
    const files = await emitWith({
      fileNaming: "preserve",
      typeNaming: "preserve",
      fieldNaming: "preserve",
    });
    expect([...files.keys()].sort()).toEqual(
      ["UserProfile.ts", "enums/AccountStatus.ts", "index.ts"].sort(),
    );
    expect(files.get("UserProfile.ts")).toContain("export interface UserProfile");
    expect(files.get("UserProfile.ts")).toContain("displayName: string;");
    expect(files.get("UserProfile.ts")).toContain("emailAddress: string;");
  });
});
