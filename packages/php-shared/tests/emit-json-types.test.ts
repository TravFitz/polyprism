// Tests for the PHP @json(...) → JsonTypes/<Name>.php pipeline.
//
// Coverage:
//   - Inline-anonymous form auto-names from Model+Field (PascalCased)
//   - Inline-named form uses the explicit name
//   - Flat object emits a final readonly class with constructor property promotion
//   - Nested object stays inline as PHPDoc `array{...}` shape (no new file)
//   - Arrays of primitives emit `array` + PHPDoc `array<int, T>`
//   - Optional fields nullable + default null
//   - TS `number` → PHP `float`, `unknown`/`any` → `mixed`
//   - Unsupported shapes (unions, generics) warn + fall back to mixed
//   - Bare and with-path forms warn + fall back to mixed at field level
//   - Multiple fields referencing the same inline-named type emit one file
//   - The model file references the JsonType via the short class name and a `use`

import {
  type AnnotationSet,
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  emptyAnnotationSet,
  type FieldDef,
  type FieldType,
  type GeneratorContext,
  type JsonAnnotation,
  type ModelDef,
} from "@polyprism/core";
import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../src/diagnostics.js";
import { emitPhpModels } from "../src/emit-models.js";

function fieldWithJson(name: string, json: JsonAnnotation, isRequired = true): FieldDef {
  const annotations: AnnotationSet = { ...emptyAnnotationSet(null), json };
  return {
    name,
    dbName: null,
    type: { kind: "scalar", scalar: "Json" } as FieldType,
    isList: false,
    isRequired,
    isUnique: false,
    isId: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    default: null,
    documentation: null,
    annotations,
    nativeType: null,
  };
}

function fieldPlain(name: string, scalar: "String" | "Int"): FieldDef {
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

function makeContext(models: ModelDef[]): {
  ctx: GeneratorContext;
  diagnostics: Diagnostic[];
  writer: { files: Map<string, string> };
} {
  const writer = createInMemoryFileWriter();
  const diagnostics: Diagnostic[] = [];
  const ctx: GeneratorContext = {
    ir: { models, enums: [] },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer,
  };
  return { ctx, diagnostics, writer };
}

async function emit(
  ctx: GeneratorContext,
  diagnostics: Diagnostic[],
  opts: Partial<Parameters<typeof emitPhpModels>[1]> = {},
): Promise<void> {
  await emitPhpModels(ctx, {
    declarationStyle: "class",
    onDiagnostic: (d) => diagnostics.push(d),
    ...opts,
  });
}

describe("@json — inline-anonymous form", () => {
  it("auto-names the generated class as Model + Field (PascalCased) and writes JsonTypes/<Name>.php", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("User", [
        fieldPlain("id", "String"),
        fieldWithJson("settings", {
          kind: "inline-anonymous",
          typeExpression: "{ theme: string, locale: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    expect(writer.files.has("JsonTypes/UserSettings.php")).toBe(true);
    const out = writer.files.get("JsonTypes/UserSettings.php")!;
    expect(out).toContain("namespace Generated\\JsonTypes;");
    expect(out).toContain("final class UserSettings");
    expect(out).toContain("public readonly string $theme,");
    expect(out).toContain("public readonly string $locale,");
  });

  it("references the auto-named class from the model via a `use` statement and the short name", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("User", [
        fieldPlain("id", "String"),
        fieldWithJson("settings", {
          kind: "inline-anonymous",
          typeExpression: "{ theme: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const userOut = writer.files.get("Models/User.php")!;
    expect(userOut).toContain("use Generated\\JsonTypes\\UserSettings;");
    expect(userOut).toContain("public UserSettings $settings");
    // Field is NOT typed as `mixed` — the resolver hit the inline path.
    expect(userOut).not.toContain("public mixed $settings");
  });
});

describe("@json — inline-named form", () => {
  it("uses the explicit name and emits JsonTypes/<Name>.php", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("Customer", [
        fieldPlain("id", "String"),
        fieldWithJson("address", {
          kind: "inline-named",
          typeName: "BillingAddress",
          typeExpression: "{ street: string, city: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    expect(writer.files.has("JsonTypes/BillingAddress.php")).toBe(true);
    const out = writer.files.get("JsonTypes/BillingAddress.php")!;
    expect(out).toContain("final class BillingAddress");
    expect(out).toContain("public readonly string $street,");
    expect(out).toContain("public readonly string $city,");
  });

  it("dedupes when the same inline-named shape is referenced from multiple fields", async () => {
    const ann: JsonAnnotation = {
      kind: "inline-named",
      typeName: "Tag",
      typeExpression: "{ id: string, label: string }",
    };
    const { ctx, diagnostics, writer } = makeContext([
      model("Post", [
        fieldPlain("id", "String"),
        fieldWithJson("primary", ann),
        fieldWithJson("secondary", ann),
      ]),
    ]);
    await emit(ctx, diagnostics);
    expect(writer.files.has("JsonTypes/Tag.php")).toBe(true);
    // No accidental Tag2.php / etc.
    expect([...writer.files.keys()].filter((k) => k.startsWith("JsonTypes/Tag")).length).toBe(1);
  });
});

describe("@json — type translation", () => {
  it("maps TS primitives correctly: string→string, number→float, boolean→bool", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ name: string, count: number, active: boolean }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly string $name,");
    expect(out).toContain("public readonly float $count,");
    expect(out).toContain("public readonly bool $active,");
  });

  it("maps `unknown` and `any` to PHP `mixed` without warning", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ a: unknown, b: any }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly mixed $a,");
    expect(out).toContain("public readonly mixed $b,");
    // No warnings for explicit unknown/any — they're the intentional escape hatches.
    expect(diagnostics.filter((d) => d.severity === "warning")).toEqual([]);
  });

  it("makes optional fields nullable and defaults them to null (sorted after required)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ name: string, nick?: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly string $name,");
    expect(out).toContain("public readonly ?string $nick = null,");
    // Required-first ordering applies inside JSON value classes too.
    expect(out.indexOf("$name")).toBeLessThan(out.indexOf("$nick"));
  });

  it("emits arrays of primitives as PHP array + PHPDoc array<int, T>", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ tags: string[] }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly array $tags,");
    expect(out).toContain("@var array<int, string>");
  });

  it("flattens nested objects to PHP array + PHPDoc array{...} shape (no spawned sub-class)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ outer: { inner: string, count: number } }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly array $outer,");
    expect(out).toContain("@var array{inner: string, count: float}");
    // No accidental sub-class file spawned for the nested shape.
    expect(writer.files.has("JsonTypes/BlobOuter.php")).toBe(false);
  });
});

describe("@json — unsupported shapes warn + fall back", () => {
  it("falls back to `mixed` (with warning) when an inline shape contains a TS union", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ value: string | number }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("public readonly mixed $value,");
    const warn = diagnostics.find((d) => d.context === "JsonTypes.Blob");
    expect(warn?.severity).toBe("warning");
    expect(warn?.message).toContain("supported subset");
  });

  it("rejects a top-level non-object expression (e.g. just `SomeIdentifier`) and skips file emission", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "SomeIdentifier",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    expect(writer.files.has("JsonTypes/Blob.php")).toBe(false);
    // Field falls back to `mixed` since the class wasn't generated.
    const mOut = writer.files.get("Models/M.php")!;
    expect(mOut).toContain("public mixed $blob");
    expect(diagnostics.find((d) => d.context === "JsonTypes.Blob")?.severity).toBe("warning");
  });
});

describe("@json — bare and with-path forms (unsupported in PHP)", () => {
  it("bare form warns and falls back to `mixed` (the field doesn't get a generated class)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", { kind: "bare", typeName: "Settings" }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const mOut = writer.files.get("Models/M.php")!;
    expect(mOut).toContain("public mixed $blob");
    expect(writer.files.has("JsonTypes/Settings.php")).toBe(false);
    const warn = diagnostics.find((d) => d.context === "M.blob");
    expect(warn?.severity).toBe("warning");
    expect(warn?.message).toContain("bare");
    expect(warn?.message).toContain("@type");
  });

  it("with-path form warns and falls back to `mixed`", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "with-path",
          typeName: "BillingAddress",
          importPath: "./types/billing",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const mOut = writer.files.get("Models/M.php")!;
    expect(mOut).toContain("public mixed $blob");
    expect(writer.files.has("JsonTypes/BillingAddress.php")).toBe(false);
    const warn = diagnostics.find((d) => d.context === "M.blob");
    expect(warn?.severity).toBe("warning");
    expect(warn?.message).toContain("with-path");
  });
});

describe("@json — custom namespace", () => {
  it("respects jsonTypesNamespace when set via options", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("User", [
        fieldPlain("id", "String"),
        fieldWithJson("settings", {
          kind: "inline-named",
          typeName: "Settings",
          typeExpression: "{ theme: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics, { jsonTypesNamespace: "App\\Json" });
    const out = writer.files.get("JsonTypes/Settings.php")!;
    expect(out).toContain("namespace App\\Json;");
    const userOut = writer.files.get("Models/User.php")!;
    expect(userOut).toContain("use App\\Json\\Settings;");
  });

  it("does NOT emit a `use` line when jsonTypesNamespace equals modelsNamespace (flat namespacing)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("User", [
        fieldPlain("id", "String"),
        fieldWithJson("settings", {
          kind: "inline-named",
          typeName: "Settings",
          typeExpression: "{ theme: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics, {
      modelsNamespace: "App",
      jsonTypesNamespace: "App",
    });
    // The Settings class lives in `App`; the model lives in `App`. Same
    // namespace → the model references it bare, no use statement.
    const userOut = writer.files.get("Models/User.php")!;
    expect(userOut).toContain("public Settings $settings");
    expect(userOut).not.toContain("use App\\Settings;");
  });
});

describe("@json — input validation edge cases", () => {
  it("rejects a property name with a TS `$` prefix (would produce invalid `public string $$foo` in PHP)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ $foo: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    // Class is NOT emitted — the unparseable shape falls back to mixed.
    expect(writer.files.has("JsonTypes/Blob.php")).toBe(false);
    const mOut = writer.files.get("Models/M.php")!;
    expect(mOut).toContain("public mixed $blob");
    // The warning explains the shape isn't parseable.
    const warn = diagnostics.find((d) => d.context === "JsonTypes.Blob");
    expect(warn?.severity).toBe("warning");
  });

  it("accepts an empty object `{}` and emits a no-op final class", async () => {
    // An empty inline shape is unusual but harmless — `final class Empty {
    // public function __construct() {} }` is valid PHP and locks in the
    // shape if the user later expands it. Document the behaviour by
    // asserting on it so future refactors don't silently drift.
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Empty",
          typeExpression: "{}",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    expect(writer.files.has("JsonTypes/Empty.php")).toBe(true);
    const out = writer.files.get("JsonTypes/Empty.php")!;
    expect(out).toContain("final class Empty");
    expect(out).toContain("public function __construct() {}");
  });
});

describe("@json — readonly syntax depends on declarationStyle", () => {
  it("emits `final class` + per-property `readonly` for the php-class style (PHP 8.1 floor)", async () => {
    // `final readonly class` is PHP 8.2+ only; the php-class generator
    // targets 8.1 so JsonType classes must use the per-property readonly
    // syntax instead.
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ name: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics, { declarationStyle: "class" });
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("final class Blob");
    expect(out).not.toContain("final readonly class Blob");
    expect(out).toContain("public readonly string $name,");
  });

  it("emits `final readonly class` for the php-readonly style (PHP 8.2 floor)", async () => {
    const { ctx, diagnostics, writer } = makeContext([
      model("M", [
        fieldPlain("id", "String"),
        fieldWithJson("blob", {
          kind: "inline-named",
          typeName: "Blob",
          typeExpression: "{ name: string }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics, { declarationStyle: "readonly" });
    const out = writer.files.get("JsonTypes/Blob.php")!;
    expect(out).toContain("final readonly class Blob");
    // Per-property `readonly` would be redundant + a PHP error on 8.2+
    // when the class itself is already `readonly`.
    expect(out).not.toContain("public readonly string $name,");
    expect(out).toContain("public string $name,");
  });
});

describe("@json — auto-naming collisions", () => {
  it("warns when two different inline shapes resolve to the same JsonType class name", async () => {
    // Two inline-named declarations sharing a name with different shapes.
    // (The same trap exists for inline-anonymous shapes whose
    // Model+Field PascalCase to the same identifier — same warning path.)
    const { ctx, diagnostics } = makeContext([
      model("A", [
        fieldPlain("id", "String"),
        fieldWithJson("data", {
          kind: "inline-named",
          typeName: "Shared",
          typeExpression: "{ x: string }",
        }),
      ]),
      model("B", [
        fieldPlain("id", "String"),
        fieldWithJson("data", {
          kind: "inline-named",
          typeName: "Shared",
          typeExpression: "{ y: number }",
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const collision = diagnostics.find(
      (d) => d.severity === "warning" && d.message.includes("auto-naming collision"),
    );
    expect(collision).toBeDefined();
    expect(collision?.message).toContain("Shared");
    expect(collision?.message).toContain("A.data");
    expect(collision?.message).toContain("B.data");
  });

  it("does NOT warn when the same shape is registered twice (legitimate dedupe)", async () => {
    const sameShape = "{ x: string }";
    const { ctx, diagnostics } = makeContext([
      model("A", [
        fieldPlain("id", "String"),
        fieldWithJson("data", {
          kind: "inline-named",
          typeName: "Shared",
          typeExpression: sameShape,
        }),
      ]),
      model("B", [
        fieldPlain("id", "String"),
        fieldWithJson("data", {
          kind: "inline-named",
          typeName: "Shared",
          typeExpression: sameShape,
        }),
      ]),
    ]);
    await emit(ctx, diagnostics);
    const collision = diagnostics.find((d) => d.message.includes("auto-naming collision"));
    expect(collision).toBeUndefined();
  });
});
