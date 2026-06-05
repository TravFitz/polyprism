// Focused tests for declarationStyle: "class" — PHP 8.1+ classes with
// public typed properties via constructor property promotion. Substring
// assertions on the rendered output; snapshot tests live in
// emit-snapshot.test.ts for full-string contracts.

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
} from "@polyprism/core";
import { describe, expect, it } from "vitest";

import { emitPhpModels } from "../src/emit-models.js";

interface FieldOverrides {
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  default?: DefaultValue | null;
  annotations?: AnnotationSet;
  documentation?: string;
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
    documentation: o.documentation ?? null,
    annotations: o.annotations ?? emptyAnnotationSet(o.documentation ?? null),
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

const litInt = (v: number): DefaultValue => ({ kind: "literal", value: v });
const litStr = (v: string): DefaultValue => ({ kind: "literal", value: v });
const litBool = (v: boolean): DefaultValue => ({ kind: "literal", value: v });
const nowDefault = (): DefaultValue => ({ kind: "function", name: "now", args: [] });
const cuidDefault = (): DefaultValue => ({ kind: "function", name: "cuid", args: [] });

describe("php-class — file scaffolding", () => {
  it("emits PHP open tag, strict_types declaration, and namespace", async () => {
    const { ctx, writer } = makeContext([model("User", [field("id", scalar("String"))])]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("<?php");
    expect(out).toContain("declare(strict_types=1);");
    expect(out).toContain("namespace Generated\\Models;");
  });

  it("emits one file per model under Models/, named after the resolved type ident", async () => {
    const { ctx, writer } = makeContext([
      model("User", [field("id", scalar("String"))]),
      model("Order", [field("id", scalar("String"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    expect(writer.files.has("Models/User.php")).toBe(true);
    expect(writer.files.has("Models/Order.php")).toBe(true);
  });

  it("respects custom namespaces from options", async () => {
    const { ctx, writer } = makeContext([model("User", [field("id", scalar("String"))])]);
    await emitPhpModels(ctx, {
      declarationStyle: "class",
      modelsNamespace: "App\\Domain\\Entities",
      enumsNamespace: "App\\Domain\\Enums",
    });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("namespace App\\Domain\\Entities;");
  });
});

describe("php-class — class structure", () => {
  it("emits `final class` with constructor property promotion", async () => {
    const { ctx, writer } = makeContext([
      model("User", [field("id", scalar("String")), field("email", scalar("String"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("final class User");
    expect(out).toContain("public function __construct(");
    expect(out).toContain("public string $id");
    expect(out).toContain("public string $email");
  });

  it("emits `final readonly class` for the readonly style", async () => {
    const { ctx, writer } = makeContext([model("User", [field("id", scalar("String"))])]);
    await emitPhpModels(ctx, { declarationStyle: "readonly" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("final readonly class User");
    expect(out).not.toContain("final class User");
  });
});

describe("php-class — scalar type mapping", () => {
  const cases: Array<
    [
      string,
      "String" | "Int" | "Float" | "Boolean" | "BigInt" | "Decimal" | "DateTime" | "Json" | "Bytes",
      string,
    ]
  > = [
    ["String → string", "String", "public string $f"],
    ["Int → int", "Int", "public int $f"],
    ["Float → float", "Float", "public float $f"],
    ["Boolean → bool", "Boolean", "public bool $f"],
    ["BigInt → int", "BigInt", "public int $f"],
    ["Decimal → string", "Decimal", "public string $f"],
    ["DateTime → \\DateTimeImmutable", "DateTime", "public \\DateTimeImmutable $f"],
    ["Json → mixed", "Json", "public mixed $f"],
    ["Bytes → string", "Bytes", "public string $f"],
  ];

  for (const [name, scalarName, expected] of cases) {
    it(name, async () => {
      const { ctx, writer } = makeContext([model("M", [field("f", scalar(scalarName))])]);
      await emitPhpModels(ctx, { declarationStyle: "class" });
      const out = writer.files.get("Models/M.php")!;
      expect(out).toContain(expected);
    });
  }
});

describe("php-class — nullability + lists", () => {
  it("prefixes nullable scalar types with `?` and defaults them to null", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("f", scalar("String"), { isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public ?string $f = null");
  });

  it("types list fields as `array` with PHPDoc `@var array<int, T>`", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("tags", scalar("String"), { isList: true })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public array $tags = []");
    expect(out).toContain("@var array<int, string>");
  });

  it("nullable list still types as `array` (never `?array`) and defaults to []", async () => {
    // Prisma never returns null for a list — empty becomes [].
    const { ctx, writer } = makeContext([
      model("M", [field("tags", scalar("String"), { isList: true, isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public array $tags = []");
    expect(out).not.toContain("?array");
  });
});

describe("php-class — enums", () => {
  it("emits a separate Enums/Role.php file with backed enum syntax", async () => {
    const { ctx, writer } = makeContext(
      [model("User", [field("role", enumRef("Role"))])],
      [enumDef("Role", ["ADMIN", "MEMBER"])],
    );
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const enumOut = writer.files.get("Enums/Role.php")!;
    expect(enumOut).toContain("namespace Generated\\Enums;");
    expect(enumOut).toContain("enum Role: string");
    expect(enumOut).toContain("case ADMIN = 'ADMIN';");
    expect(enumOut).toContain("case MEMBER = 'MEMBER';");
  });

  it("imports the enum class via `use` and references the short name from the model", async () => {
    const { ctx, writer } = makeContext(
      [model("User", [field("role", enumRef("Role"))])],
      [enumDef("Role", ["ADMIN"])],
    );
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("use Generated\\Enums\\Role;");
    expect(out).toContain("public Role $role");
  });
});

describe("php-class — relations", () => {
  it("imports cross-namespace relation targets via `use` and references the short name", async () => {
    const { ctx, writer } = makeContext([
      model("Order", [field("customer", relation("Customer"))]),
      model("Customer", [field("id", scalar("String"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/Order.php")!;
    // Order and Customer share the same models namespace, so no use needed —
    // they resolve as bare class names.
    expect(out).toContain("public Customer $customer");
    expect(out).not.toContain("use Generated\\Models\\Customer;");
  });

  it("skips `use` for self-referencing relations", async () => {
    const { ctx, writer } = makeContext([
      model("Node", [
        field("id", scalar("String")),
        field("parent", relation("Node"), { isRequired: false }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/Node.php")!;
    expect(out).toContain("public ?Node $parent = null");
    expect(out).not.toContain("use Generated\\Models\\Node;");
  });

  it("emits multiple cross-namespace `use` lines (sorted) when a model references both an enum and a foreign-namespace target", async () => {
    // Custom namespaces — every cross-namespace reference must surface as
    // its own `use` line, and the lines should be sorted lexicographically
    // (matching standard PHP-CS-Fixer's OrderedImportsFixer behaviour).
    const { ctx, writer } = makeContext(
      [
        model("User", [
          field("id", scalar("String")),
          field("role", enumRef("Role")),
          field("createdAt", scalar("DateTime")),
        ]),
      ],
      [enumDef("Role", ["ADMIN"])],
    );
    await emitPhpModels(ctx, {
      declarationStyle: "class",
      modelsNamespace: "App\\Domain\\Entities",
      enumsNamespace: "App\\Domain\\Enums",
    });
    const out = writer.files.get("Models/User.php")!;
    // Enum is in a different namespace → must produce a use.
    expect(out).toContain("use App\\Domain\\Enums\\Role;");
    // \DateTimeImmutable is a built-in (global namespace); it's referenced
    // verbatim and never gets a use.
    expect(out).not.toContain("use \\DateTimeImmutable;");
    // The constructor still references the short enum name.
    expect(out).toContain("public Role $role");
  });
});

describe("php-class — defaults", () => {
  it("emits literal string defaults with single-quote escaping", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("name", scalar("String"), { hasDefaultValue: true, default: litStr("hello") }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public string $name = 'hello'");
  });

  it("escapes single quotes and backslashes in literal string defaults", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("name", scalar("String"), {
          hasDefaultValue: true,
          default: litStr("can't \\stop"),
        }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public string $name = 'can\\'t \\\\stop'");
  });

  it("emits numeric literal defaults for Int (verbatim) and Float (with `.0` when integer-valued)", async () => {
    // Prisma's DMMF coerces `@default(1.0)` to JS number `1`. We preserve the
    // "this is a float literal" intent by emitting `1.0` on float-typed
    // properties whose default is integer-valued. Non-integer floats render
    // as their natural String() form.
    const { ctx, writer } = makeContext([
      model("M", [
        field("count", scalar("Int"), { hasDefaultValue: true, default: litInt(42) }),
        field("ratio", scalar("Float"), { hasDefaultValue: true, default: litInt(0) }),
        field("pi", scalar("Float"), {
          hasDefaultValue: true,
          default: { kind: "literal", value: 3.14 },
        }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public int $count = 42");
    expect(out).toContain("public float $ratio = 0.0");
    expect(out).toContain("public float $pi = 3.14");
  });

  it("emits boolean literal defaults as true/false", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("active", scalar("Boolean"), { hasDefaultValue: true, default: litBool(true) }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public bool $active = true");
  });

  it("translates now() to `new \\DateTimeImmutable()`", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("createdAt", scalar("DateTime"), {
          hasDefaultValue: true,
          default: nowDefault(),
        }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public \\DateTimeImmutable $createdAt = new \\DateTimeImmutable()");
  });

  it("emits enum-case defaults using the short name (with use registration)", async () => {
    const { ctx, writer } = makeContext(
      [
        model("User", [
          field("role", enumRef("Role"), {
            hasDefaultValue: true,
            default: { kind: "literal", value: "MEMBER" },
          }),
        ]),
      ],
      [enumDef("Role", ["ADMIN", "MEMBER"])],
    );
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("use Generated\\Enums\\Role;");
    expect(out).toContain("public Role $role = Role::MEMBER");
  });

  it("omits the default for unrepresentable function defaults (cuid/uuid) — field becomes required", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("id", scalar("String"), { hasDefaultValue: true, default: cuidDefault() }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    // cuid() has no PHP equivalent — the property becomes a required constructor arg.
    expect(out).toContain("public string $id,");
    expect(out).not.toContain("$id = ");
  });
});

describe("php-class — annotations", () => {
  it("omits @hide fields from the class body entirely", async () => {
    const hideAnnotations = { ...emptyAnnotationSet(null), hide: true };
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String")),
        field("password", scalar("String"), { annotations: hideAnnotations }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).not.toContain("$password");
  });

  it("emits @deprecated PHPDoc on annotated fields", async () => {
    const deprecatedAnnotations: AnnotationSet = {
      ...emptyAnnotationSet(null),
      deprecated: { reason: "use createdAt instead" },
    };
    const { ctx, writer } = makeContext([
      model("M", [field("createDate", scalar("DateTime"), { annotations: deprecatedAnnotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("@deprecated use createdAt instead");
  });

  it("respects @name on the model (changes the class identifier)", async () => {
    const renamedAnnotations: AnnotationSet = { ...emptyAnnotationSet(null), name: "Customer" };
    const m: ModelDef = {
      ...model("User", [field("id", scalar("String"))]),
      annotations: renamedAnnotations,
    };
    const { ctx, writer } = makeContext([m]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    expect(writer.files.has("Models/Customer.php")).toBe(true);
    const out = writer.files.get("Models/Customer.php")!;
    expect(out).toContain("final class Customer");
  });

  it("respects @type override on a field", async () => {
    const typeAnnotations: AnnotationSet = {
      ...emptyAnnotationSet(null),
      type: { typeName: "\\Brick\\Math\\BigDecimal", importPath: null },
    };
    const { ctx, writer } = makeContext([
      model("M", [field("amount", scalar("Decimal"), { annotations: typeAnnotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public \\Brick\\Math\\BigDecimal $amount");
    // Defensive: confirm the original Decimal → string mapping is GONE,
    // not just shadowed by the override-substring assertion above.
    expect(out).not.toContain("public string $amount");
  });

  it("strips a leading `?` from a @type override on an optional field (avoid `??Foo`)", async () => {
    // If the user writes `@type("?Foo")` on an optional field, the renderer
    // must NOT produce `??Foo` (a PHP syntax error). wrapNullability will
    // reapply the `?` for optional fields, so we strip any leading `?` from
    // the override first.
    const typeAnnotations: AnnotationSet = {
      ...emptyAnnotationSet(null),
      type: { typeName: "?Foo", importPath: null },
    };
    const { ctx, writer } = makeContext([
      model("M", [
        field("f", scalar("String"), { isRequired: false, annotations: typeAnnotations }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public ?Foo $f");
    expect(out).not.toContain("??Foo");
  });

  it("warns + falls back to mixed when @json(...) is present on a Json field", async () => {
    const jsonAnnotations: AnnotationSet = {
      ...emptyAnnotationSet(null),
      json: { kind: "bare", typeName: "Settings" },
    };
    const diagnostics: Array<{ severity: string; context: string; message: string }> = [];
    const { ctx, writer } = makeContext([
      model("M", [field("settings", scalar("Json"), { annotations: jsonAnnotations })]),
    ]);
    await emitPhpModels(ctx, {
      declarationStyle: "class",
      onDiagnostic: (d) => diagnostics.push(d),
    });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public mixed $settings");
    const warn = diagnostics.find((d) => d.context === "M.settings");
    expect(warn?.severity).toBe("warning");
    expect(warn?.message).toContain("@json");
  });
});

describe("php-class — type nullability edge cases", () => {
  it("does NOT prefix nullable Json with `?` — `mixed` already permits null", async () => {
    // `?mixed` is a PHP syntax error; the renderer must pass `mixed` through
    // unchanged for nullable Json fields.
    const { ctx, writer } = makeContext([
      model("M", [field("payload", scalar("Json"), { isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public mixed $payload = null");
    expect(out).not.toContain("?mixed");
  });
});

describe("php-class — constructor argument ordering", () => {
  it("emits required parameters before optional ones (PHP 8.4-deprecation safe)", async () => {
    // Schema order: required, optional, required, optional.
    // Rendered order: required, required, optional, optional.
    const { ctx, writer } = makeContext([
      model("M", [
        field("a", scalar("String")), // required, no default
        field("b", scalar("Int"), { hasDefaultValue: true, default: litInt(1) }), // optional, defaulted
        field("c", scalar("String")), // required, no default
        field("d", scalar("Boolean"), { hasDefaultValue: true, default: litBool(true) }), // optional, defaulted
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    // Required params come first in the constructor body, preserving schema
    // order WITHIN the required group, then within the optional group.
    const aPos = out.indexOf("$a");
    const bPos = out.indexOf("$b");
    const cPos = out.indexOf("$c");
    const dPos = out.indexOf("$d");
    expect(aPos).toBeLessThan(cPos);
    expect(cPos).toBeLessThan(bPos);
    expect(bPos).toBeLessThan(dPos);
  });

  it("preserves schema order when all fields are required (no defaults)", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("first", scalar("String")),
        field("second", scalar("Int")),
        field("third", scalar("Boolean")),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "class" });
    const out = writer.files.get("Models/M.php")!;
    const firstPos = out.indexOf("$first");
    const secondPos = out.indexOf("$second");
    const thirdPos = out.indexOf("$third");
    expect(firstPos).toBeLessThan(secondPos);
    expect(secondPos).toBeLessThan(thirdPos);
  });
});

describe("php-class — diagnostics", () => {
  it("does not call onDiagnostic for a clean schema", async () => {
    const { ctx } = makeContext([
      model("User", [field("id", scalar("String")), field("email", scalar("String"))]),
    ]);
    const calls: unknown[] = [];
    await emitPhpModels(ctx, {
      declarationStyle: "class",
      onDiagnostic: (d) => calls.push(d),
    });
    expect(calls).toEqual([]);
  });
});
