import { describe, expect, it } from "vitest";

import { parseAnnotations } from "../src/annotations/parser.js";
import { renderEnum } from "../src/emitter/render-enum.js";
import type { EnumDef, EnumValueDef } from "../src/ir/types.js";
import { emptyAnnotationSet } from "../src/ir/types.js";
import { DEFAULT_NAMING } from "../src/naming/types.js";

function makeValue(name: string, doc: string | null = null): EnumValueDef {
  return {
    name,
    dbName: null,
    documentation: doc,
    annotations: doc ? parseAnnotations(doc) : emptyAnnotationSet(null),
  };
}

function makeEnum(name: string, values: EnumValueDef[], doc: string | null = null): EnumDef {
  return {
    name,
    dbName: null,
    documentation: doc,
    values,
    annotations: doc ? parseAnnotations(doc) : emptyAnnotationSet(null),
  };
}

describe("renderEnum", () => {
  it("renders a basic enum with PascalCase default", () => {
    const enumDef = makeEnum("MerchantFlow", [
      makeValue("LEARNING"),
      makeValue("DEFERRED_IMPORT"),
      makeValue("IMMEDIATE_IMPORT"),
    ]);
    expect(renderEnum(enumDef, DEFAULT_NAMING)).toMatchInlineSnapshot(`
      "export enum MerchantFlow {
        LEARNING = "LEARNING",
        DEFERRED_IMPORT = "DEFERRED_IMPORT",
        IMMEDIATE_IMPORT = "IMMEDIATE_IMPORT",
      }
      "
    `);
  });

  it("PascalCase-normalises a lowercase enum name", () => {
    const enumDef = makeEnum("status", [makeValue("PENDING")]);
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("export enum Status {");
  });

  it("uses @name override verbatim", () => {
    const enumDef = makeEnum("status", [makeValue("PENDING")], "@name(BulkJobStatus)");
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("export enum BulkJobStatus {");
  });

  it("hides values annotated with @hide", () => {
    const enumDef = makeEnum("Status", [
      makeValue("ACTIVE"),
      makeValue("DEPRECATED_OLD", "@hide"),
      makeValue("ARCHIVED"),
    ]);
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("ACTIVE");
    expect(output).toContain("ARCHIVED");
    expect(output).not.toContain("DEPRECATED_OLD");
  });

  it("emits @deprecated JSDoc on values", () => {
    const enumDef = makeEnum("Status", [
      makeValue("ACTIVE"),
      makeValue("LEGACY", '@deprecated("use ACTIVE instead")'),
    ]);
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("@deprecated use ACTIVE instead");
    expect(output).toContain('LEGACY = "LEGACY",');
  });

  it("emits @deprecated JSDoc on the enum itself", () => {
    const enumDef = makeEnum("OldStatus", [makeValue("X")], "@deprecated");
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("/**\n * @deprecated\n */");
  });

  it("preserves documentation text on the enum", () => {
    const enumDef = makeEnum("Status", [makeValue("X")], "Order processing status.");
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain("/**\n * Order processing status.\n */");
  });

  it("respects dbName via @map (uses dbName as the string value)", () => {
    const enumDef: EnumDef = {
      name: "Status",
      dbName: null,
      documentation: null,
      values: [
        {
          name: "ACTIVE",
          dbName: "active_db",
          documentation: null,
          annotations: emptyAnnotationSet(null),
        },
      ],
      annotations: emptyAnnotationSet(null),
    };
    const output = renderEnum(enumDef, DEFAULT_NAMING);
    expect(output).toContain('ACTIVE = "active_db",');
  });
});
