// End-to-end emitter tests. Build IR by hand, run emit(), assert the
// in-memory writer captured the expected file contents.

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
  parseAnnotations,
} from "@polyprism/core";
import { describe, expect, it } from "vitest";

import { emitModels } from "../src/emit-models.js";

// All tests in this file use "interface" mode. ts-type tests live in their
// own file and parameterise the style differently.
const emit = (ctx: GeneratorContext) => emitModels(ctx, { declarationStyle: "interface" });

// ────────────────────────────────────────────────────────────────────────────
// Test builders — make IR construction terse
// ────────────────────────────────────────────────────────────────────────────

function field(overrides: Partial<FieldDef> & Pick<FieldDef, "name" | "type">): FieldDef {
  return {
    dbName: null,
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

function scalar(
  name: string,
  scalar: FieldDef["type"] extends { kind: "scalar" }
    ? never
    : "String" | "Boolean" | "Int" | "BigInt" | "Float" | "Decimal" | "DateTime" | "Json" | "Bytes",
  overrides: Partial<FieldDef> = {},
): FieldDef {
  return field({
    name,
    type: { kind: "scalar", scalar },
    ...overrides,
  });
}

function model(
  name: string,
  fields: readonly FieldDef[],
  overrides: Partial<ModelDef> = {},
): ModelDef {
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

function _withDoc(node: ModelDef | FieldDef | EnumDef, doc: string): typeof node {
  return {
    ...node,
    documentation: doc,
    annotations: parseAnnotations(doc),
  } as typeof node;
}

function makeEnum(name: string, values: readonly string[], doc: string | null = null): EnumDef {
  return {
    name,
    dbName: null,
    documentation: doc,
    values: values.map((v) => ({
      name: v,
      dbName: null,
      documentation: null,
      annotations: emptyAnnotationSet(null),
    })),
    annotations: doc ? parseAnnotations(doc) : emptyAnnotationSet(null),
  };
}

function makeContext(ir: PolyPrismIR, naming: NamingConfig = DEFAULT_NAMING) {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir,
    config: { naming, emitIndex: false },
    outputDir: "/virtual",
    writer,
  };
  return { ctx, writer };
}

// ────────────────────────────────────────────────────────────────────────────
// Basic shapes
// ────────────────────────────────────────────────────────────────────────────

describe("emit — primitive scalar fields", () => {
  it("renders string, boolean, int, float", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Basic", [
          scalar("name", "String"),
          scalar("active", "Boolean"),
          scalar("count", "Int"),
          scalar("ratio", "Float"),
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("Basic.ts")).toMatchInlineSnapshot(`
      "export interface Basic {
        name: string;
        active: boolean;
        count: number;
        ratio: number;
      }
      "
    `);
  });

  it("nullable fields get | null", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          scalar("required", "String", { isRequired: true }),
          scalar("optional", "String", { isRequired: false }),
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain("required: string;");
    expect(writer.files.get("M.ts")).toContain("optional: string | null;");
  });

  it("list fields get [] suffix and never | null", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          scalar("tags", "String", { isList: true, isRequired: true }),
          scalar("optionalTags", "String", { isList: true, isRequired: false }),
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain("tags: string[];");
    expect(content).toContain("optionalTags: string[];");
    expect(content).not.toContain("string[] | null");
  });
});

describe("emit — special scalar types and their imports", () => {
  it("Decimal imports from @prisma/client/runtime/library", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("price", "Decimal")])],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain('import type { Decimal } from "@prisma/client/runtime/library"');
    expect(content).toContain("price: Decimal;");
  });

  it("BigInt maps to bigint, no import needed", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("id", "BigInt")])],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain("id: bigint;");
    expect(content).not.toContain("import type { BigInt");
  });

  it("DateTime maps to Date, no import needed", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("at", "DateTime")])],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain("at: Date;");
  });

  it("Json without annotation maps to JsonValue with import", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("data", "Json")])],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain('import type { JsonValue } from "@prisma/client/runtime/library"');
    expect(content).toContain("data: JsonValue;");
  });

  it("Bytes maps to Uint8Array", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("payload", "Bytes")])],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain("payload: Uint8Array;");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Enum + relation references
// ────────────────────────────────────────────────────────────────────────────

describe("emit — enum references", () => {
  it("emits enum file and references it from the model", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Order", [
          field({
            name: "status",
            type: { kind: "enum", enumName: "OrderStatus" },
          }),
        ]),
      ],
      enums: [makeEnum("OrderStatus", ["PENDING", "PAID"])],
    });
    await emit(ctx);
    expect(writer.files.has("enums/OrderStatus.ts")).toBe(true);
    expect(writer.files.get("Order.ts")).toContain(
      'import type { OrderStatus } from "./enums/OrderStatus.js"',
    );
    expect(writer.files.get("Order.ts")).toContain("status: OrderStatus;");
  });

  it("PascalCase-normalises a lowercase enum name", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Order", [field({ name: "status", type: { kind: "enum", enumName: "status" } })]),
      ],
      enums: [makeEnum("status", ["PENDING"])],
    });
    await emit(ctx);
    expect(writer.files.has("enums/Status.ts")).toBe(true);
    expect(writer.files.get("Order.ts")).toContain(
      'import type { Status } from "./enums/Status.js"',
    );
  });

  it("honours @name override on enum (no convention applied)", async () => {
    const { ctx, writer } = makeContext({
      models: [model("Order", [field({ name: "s", type: { kind: "enum", enumName: "status" } })])],
      enums: [makeEnum("status", ["PENDING"], "@name(BulkJobStatus)")],
    });
    await emit(ctx);
    expect(writer.files.has("enums/BulkJobStatus.ts")).toBe(true);
    expect(writer.files.get("Order.ts")).toContain(
      'import type { BulkJobStatus } from "./enums/BulkJobStatus.js"',
    );
  });
});

describe("emit — relation references", () => {
  it("imports the related model", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Post", [
          field({
            name: "author",
            type: {
              kind: "relation",
              modelName: "User",
              relationName: null,
              relationFromFields: ["authorId"],
              relationToFields: ["id"],
              onDelete: null,
              onUpdate: null,
            },
          }),
        ]),
        model("User", [scalar("id", "String", { isId: true })]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("Post.ts")).toContain('import type { User } from "./User.js"');
  });

  it("skips self-import for self-referential relations", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Node", [
          scalar("id", "String", { isId: true }),
          field({
            name: "parent",
            isRequired: false,
            type: {
              kind: "relation",
              modelName: "Node",
              relationName: null,
              relationFromFields: ["parentId"],
              relationToFields: ["id"],
              onDelete: null,
              onUpdate: null,
            },
          }),
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("Node.ts")!;
    expect(content).toContain("parent: Node | null;");
    // No self-import
    expect(content).not.toContain('import type { Node } from "./Node');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Annotations
// ────────────────────────────────────────────────────────────────────────────

describe("emit — @hide", () => {
  it("skips fields annotated @hide", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          scalar("visible", "String"),
          { ...scalar("secret", "String"), annotations: parseAnnotations("@hide") },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain("visible: string;");
    expect(content).not.toContain("secret");
  });

  it("skips entire models annotated @hide", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Hidden", [scalar("x", "String")], { annotations: parseAnnotations("@hide") }),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.has("Hidden.ts")).toBe(false);
  });
});

describe("emit — @deprecated", () => {
  it("emits JSDoc on deprecated field", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("legacy", "String"),
            annotations: parseAnnotations('@deprecated("use newField")'),
          },
          scalar("newField", "String"),
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain("@deprecated use newField");
    expect(content).toContain("legacy: string;");
  });

  it("emits JSDoc on deprecated model", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("OldModel", [scalar("x", "String")], {
          annotations: parseAnnotations("@deprecated"),
        }),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("OldModel.ts")).toContain("@deprecated");
  });
});

describe("emit — @json", () => {
  it("bare form: no import emitted, type referenced by name", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("meta", "Json"),
            annotations: parseAnnotations("@json(UserMetadata)"),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain("meta: UserMetadata;");
    expect(content).not.toContain("import type { UserMetadata } from");
  });

  it("with-path form: emits import from given path", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("meta", "Json"),
            annotations: parseAnnotations('@json(UserMetadata from "./types/user")'),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    expect(content).toContain('import type { UserMetadata } from "./types/user"');
    expect(content).toContain("meta: UserMetadata;");
  });

  it("with-path array combo: imports singular type, emits field type as `Type[]`", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("tags", "Json"),
            annotations: parseAnnotations('@json(Tag[] from "./types/tag")'),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    const content = writer.files.get("M.ts")!;
    // Import is for the singular identifier — `import { Tag[] }` would be a syntax error.
    expect(content).toContain('import type { Tag } from "./types/tag"');
    // Field type uses the array form.
    expect(content).toContain("tags: Tag[];");
    // Sanity: we don't accidentally double-render the brackets in the import.
    expect(content).not.toContain("Tag[] }");
  });

  it("inline-anonymous form: generates json-types file and imports it", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("User", [
          {
            ...scalar("settings", "Json"),
            annotations: parseAnnotations("@json({ theme: string })"),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.has("json-types/UserSettings.ts")).toBe(true);
    const content = writer.files.get("User.ts")!;
    expect(content).toContain('import type { UserSettings } from "./json-types/UserSettings.js"');
    expect(content).toContain("settings: UserSettings;");
  });

  it("inline-named form: generates json-types file with explicit name", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Log", [
          {
            ...scalar("payload", "Json"),
            annotations: parseAnnotations("@json(AuditPayload = { actor: string })"),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.has("json-types/AuditPayload.ts")).toBe(true);
    expect(writer.files.get("Log.ts")).toContain(
      'import type { AuditPayload } from "./json-types/AuditPayload.js"',
    );
  });
});

describe("emit — @type override", () => {
  it("uses the override type for the field", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("email", "String"),
            annotations: parseAnnotations("@type(BrandedEmail)"),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain("email: BrandedEmail;");
  });

  it("emits import when @type has a path", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("M", [
          {
            ...scalar("email", "String"),
            annotations: parseAnnotations('@type(Email from "./brand")'),
          },
        ]),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain('import type { Email } from "./brand"');
  });
});

describe("emit — @name on model", () => {
  it("renames model and filename", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("legacy_table", [scalar("x", "String")], {
          annotations: parseAnnotations("@name(NewName)"),
        }),
      ],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.has("NewName.ts")).toBe(true);
    expect(writer.files.get("NewName.ts")).toContain("export interface NewName {");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Naming configuration
// ────────────────────────────────────────────────────────────────────────────

describe("emit — naming configuration", () => {
  it("snake_case fileNaming produces snake_case filenames", async () => {
    const { ctx, writer } = makeContext(
      {
        models: [model("UserSettings", [scalar("x", "String")])],
        enums: [],
      },
      { ...DEFAULT_NAMING, fileNaming: "snake_case" },
    );
    await emit(ctx);
    expect(writer.files.has("user_settings.ts")).toBe(true);
  });

  it("kebab-case fileNaming produces kebab-case filenames", async () => {
    const { ctx, writer } = makeContext(
      {
        models: [model("UserSettings", [scalar("x", "String")])],
        enums: [],
      },
      { ...DEFAULT_NAMING, fileNaming: "kebab-case" },
    );
    await emit(ctx);
    expect(writer.files.has("user-settings.ts")).toBe(true);
  });

  it("fieldNaming snake_case converts field identifiers", async () => {
    const { ctx, writer } = makeContext(
      {
        models: [model("M", [scalar("createdAt", "DateTime")])],
        enums: [],
      },
      { ...DEFAULT_NAMING, fieldNaming: "snake_case" },
    );
    await emit(ctx);
    expect(writer.files.get("M.ts")).toContain("created_at: Date;");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Index emission
// ────────────────────────────────────────────────────────────────────────────

describe("emit — optional index", () => {
  it("emits index.ts when emitIndex is true", async () => {
    const writer = createInMemoryFileWriter();
    const ctx: GeneratorContext = {
      ir: {
        models: [model("User", [scalar("id", "String", { isId: true })])],
        enums: [makeEnum("Status", ["A"])],
      },
      config: { naming: DEFAULT_NAMING, emitIndex: true },
      outputDir: "/v",
      writer,
    };
    await emit(ctx);
    const indexContent = writer.files.get("index.ts");
    expect(indexContent).toBeDefined();
    expect(indexContent).toContain('export type { User } from "./User.js"');
    expect(indexContent).toContain('export { Status } from "./enums/Status.js"');
  });

  it("does NOT emit index.ts by default", async () => {
    const { ctx, writer } = makeContext({
      models: [model("M", [scalar("x", "String")])],
      enums: [],
    });
    await emit(ctx);
    expect(writer.files.has("index.ts")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration — realistic shopify-duty-tax-like fixture
// ────────────────────────────────────────────────────────────────────────────

describe("emit — realistic fixture (shopify-duty-tax inspired)", () => {
  it("emits a model with Decimal, BigInt, Json (typed), and enum fields", async () => {
    const { ctx, writer } = makeContext({
      models: [
        model("Order", [
          scalar("id", "String", { isId: true }),
          scalar("shopifyId", "BigInt"),
          scalar("totalPrice", "Decimal"),
          scalar("shippingCostTotal", "Decimal", { isRequired: false }),
          scalar("createdAt", "DateTime"),
          {
            ...scalar("metadata", "Json"),
            annotations: parseAnnotations("@json({ vendor: string, tags: string[] })"),
          },
          field({
            name: "status",
            type: { kind: "enum", enumName: "OrderStatus" },
          }),
        ]),
      ],
      enums: [makeEnum("OrderStatus", ["PENDING", "PAID", "REFUNDED"])],
    });
    await emit(ctx);

    expect([...writer.files.keys()].sort()).toEqual([
      "Order.ts",
      "enums/OrderStatus.ts",
      "json-types/OrderMetadata.ts",
    ]);

    const order = writer.files.get("Order.ts")!;
    expect(order).toMatchInlineSnapshot(`
      "import type { Decimal } from "@prisma/client/runtime/library";
      import type { OrderStatus } from "./enums/OrderStatus.js";
      import type { OrderMetadata } from "./json-types/OrderMetadata.js";

      export interface Order {
        id: string;
        shopifyId: bigint;
        totalPrice: Decimal;
        shippingCostTotal: Decimal | null;
        createdAt: Date;
        metadata: OrderMetadata;
        status: OrderStatus;
      }
      "
    `);
  });
});
