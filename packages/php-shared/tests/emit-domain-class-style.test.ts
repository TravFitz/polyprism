// Focused tests for declarationStyle: "domain-class" — PHP 8.4 classes with
// property hooks that route default-coerce scalars through Polyprism\Runtime
// helpers. Substring assertions on the rendered output, mirroring the shape
// of emit-class-style.test.ts.

import type { CoerceTo, NormaliseOp } from "@polyprism/core";
import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../src/diagnostics.js";
import { emitPhpModels } from "../src/emit-models.js";
import {
  field,
  litInt,
  litStr,
  makeContext,
  model,
  scalar,
  withAnnotations,
} from "./test-helpers.js";

// ---------- file scaffolding ----------

describe("php-domain-class — file scaffolding", () => {
  it("emits PHP open tag, strict_types, namespace, and runtime use statements when needed", async () => {
    const { ctx, writer } = makeContext([model("User", [field("points", scalar("Int"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("<?php");
    expect(out).toContain("declare(strict_types=1);");
    expect(out).toContain("namespace Generated\\Models;");
    expect(out).toContain("use Polyprism\\Runtime\\Coerce;");
  });

  it("omits the Coerce use statement when no field needs coercion", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("name", scalar("String")), field("active", scalar("Boolean"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).not.toContain("use Polyprism\\Runtime\\Coerce;");
    expect(out).not.toContain("use Polyprism\\Runtime\\Normalise;");
  });

  it("only adds the Normalise use statement when a field uses @normalise", async () => {
    const annotations = withAnnotations({ normalise: ["trim", "lowercase"] as NormaliseOp[] });
    const { ctx, writer } = makeContext([
      model("User", [field("email", scalar("String"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("use Polyprism\\Runtime\\Normalise;");
    expect(out).not.toContain("use Polyprism\\Runtime\\Coerce;");
  });
});

// ---------- class structure ----------

describe("php-domain-class — class structure", () => {
  it("emits a `final class` with non-promoted properties + explicit constructor body", async () => {
    const { ctx, writer } = makeContext([
      model("User", [field("id", scalar("String")), field("points", scalar("Int"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("final class User");
    expect(out).not.toContain("final readonly class");
    expect(out).toContain("public function __construct(");
    // Non-promoted: the property is declared OUTSIDE the constructor.
    expect(out).toContain("    public string $id");
    expect(out).toContain("    public int $points");
    // Constructor body assigns through the hook.
    expect(out).toContain("$this->id = $id;");
    expect(out).toContain("$this->points = $points;");
  });

  it("orders constructor params required-first then optional (PHP 8.4 deprecation safe)", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("optional", scalar("String"), { isRequired: false }),
        field("required", scalar("String")),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    const requiredIdx = out.indexOf("$required,");
    const optionalIdx = out.indexOf("$optional = null,");
    expect(requiredIdx).toBeGreaterThan(0);
    expect(optionalIdx).toBeGreaterThan(0);
    expect(requiredIdx).toBeLessThan(optionalIdx);
  });
});

// ---------- coerce-by-default scalars emit hooks ----------

describe("php-domain-class — default-coerce scalars emit setter hooks", () => {
  const cases: Array<[string, "Int" | "Float" | "BigInt" | "Decimal" | "DateTime", string]> = [
    ["Int → Coerce::int with widened int|string input", "Int", "Coerce::int($value, 'M.f')"],
    ["Float → Coerce::float", "Float", "Coerce::float($value, 'M.f')"],
    ["BigInt → Coerce::bigint", "BigInt", "Coerce::bigint($value, 'M.f')"],
    ["Decimal → Coerce::decimal", "Decimal", "Coerce::decimal($value, 'M.f')"],
    ["DateTime → Coerce::date", "DateTime", "Coerce::date($value, 'M.f')"],
  ];
  for (const [name, scalarName, expectedCall] of cases) {
    it(name, async () => {
      const { ctx, writer } = makeContext([model("M", [field("f", scalar(scalarName))])]);
      await emitPhpModels(ctx, { declarationStyle: "domain-class" });
      const out = writer.files.get("Models/M.php")!;
      expect(out).toContain("set(");
      expect(out).toContain(expectedCall);
    });
  }

  it("widens Int setter param to int|string", async () => {
    const { ctx, writer } = makeContext([model("M", [field("f", scalar("Int"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("set(int|string $value)");
  });

  it("widens DateTime setter param to \\DateTimeImmutable|string|int", async () => {
    const { ctx, writer } = makeContext([model("M", [field("when", scalar("DateTime"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("set(\\DateTimeImmutable|string|int $value)");
  });

  it("widens the constructor param to match the setter input type", async () => {
    const { ctx, writer } = makeContext([model("M", [field("points", scalar("Int"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("int|string $points");
  });
});

// ---------- strict scalars emit no hooks ----------

describe("php-domain-class — strict scalars emit plain typed properties", () => {
  it("String field with no annotations emits no hook", async () => {
    const { ctx, writer } = makeContext([model("M", [field("name", scalar("String"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public string $name;");
    expect(out).not.toContain("set(");
  });

  it("Boolean field emits a plain typed property", async () => {
    const { ctx, writer } = makeContext([model("M", [field("active", scalar("Boolean"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public bool $active;");
    expect(out).not.toContain("set(");
  });
});

// ---------- @noCoerce overrides default-coerce ----------

describe("php-domain-class — @noCoerce", () => {
  it("opts an Int field back to strict (no hook, no widened input)", async () => {
    const annotations = withAnnotations({ noCoerce: true });
    const { ctx, writer } = makeContext([
      model("M", [field("points", scalar("Int"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public int $points;");
    expect(out).not.toContain("Coerce::int");
    expect(out).not.toContain("int|string");
  });

  it("warns when @noCoerce is applied to a strict-by-default scalar", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({ noCoerce: true });
    const { ctx } = makeContext([model("M", [field("name", scalar("String"), { annotations })])]);
    await emitPhpModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => issues.push(d),
    });
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("@noCoerce"))).toBe(
      true,
    );
  });
});

// ---------- @coerce(target) cross-type ----------

describe("php-domain-class — @coerce(target)", () => {
  it("opts a String field in to int coercion", async () => {
    const annotations = withAnnotations({ coerce: "int" as CoerceTo });
    const { ctx, writer } = makeContext([
      model("M", [field("legacyCount", scalar("String"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("Coerce::int($value, 'M.legacyCount')");
    expect(out).toContain("set(int|string $value)");
  });

  it("shifts the storage type when @coerce target differs from the field scalar", async () => {
    // Cross-type @coerce stores the COERCE TARGET's type, not the field's
    // declared Prisma scalar. `String @coerce(int)` storage must be `int`
    // — the hook writes `Coerce::int(...)` which returns int, and PHP's
    // strict typed-property hooks throw at runtime if the property type
    // is `string`. This was a real bug caught + fixed during development;
    // pinning it here so a future `storageTypeFor` refactor can't regress.
    const annotations = withAnnotations({ coerce: "int" as CoerceTo });
    const { ctx, writer } = makeContext([
      model("M", [
        field("requiredCount", scalar("String"), { annotations }),
        field("optionalCount", scalar("String"), { annotations, isRequired: false }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    // Required: property declared as `int`, not `string`.
    expect(out).toContain("public int $requiredCount");
    expect(out).not.toContain("public string $requiredCount");
    // Nullable: property declared as `?int`, not `?string`.
    expect(out).toContain("public ?int $optionalCount");
    expect(out).not.toContain("public ?string $optionalCount");
  });

  it("shifts storage type to \\DateTimeImmutable for String @coerce(date)", async () => {
    const annotations = withAnnotations({ coerce: "date" as CoerceTo });
    const { ctx, writer } = makeContext([
      model("M", [field("when", scalar("String"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public \\DateTimeImmutable $when");
    expect(out).not.toContain("public string $when");
  });

  it("@coerce(string) inlines a (string) cast", async () => {
    const annotations = withAnnotations({ coerce: "string" as CoerceTo });
    const { ctx, writer } = makeContext([
      model("M", [field("label", scalar("Int"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("(string) $value");
    expect(out).toContain("set(string|int|float|bool $value)");
  });

  it("errors on @coerce applied to a Boolean field", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({ coerce: "int" as CoerceTo });
    const { ctx } = makeContext([
      model("M", [field("active", scalar("Boolean"), { annotations })]),
    ]);
    await expect(
      emitPhpModels(ctx, {
        declarationStyle: "domain-class",
        onDiagnostic: (d) => issues.push(d),
      }),
    ).rejects.toThrow(/PolyPrism: PHP emit failed/);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("Boolean"))).toBe(true);
  });

  it("warns when @coerce target matches the field's default (redundant)", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({ coerce: "int" as CoerceTo });
    const { ctx } = makeContext([model("M", [field("f", scalar("Int"), { annotations })])]);
    await emitPhpModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => issues.push(d),
    });
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("redundant"))).toBe(
      true,
    );
  });
});

// ---------- @normalise ops on String fields ----------

describe("php-domain-class — @normalise", () => {
  it("emits Normalise::apply with the ops in declared order on a required String field", async () => {
    const annotations = withAnnotations({ normalise: ["trim", "lowercase"] as NormaliseOp[] });
    const { ctx, writer } = makeContext([
      model("User", [field("email", scalar("String"), { annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("Normalise::apply($value, [Normalise::TRIM, Normalise::LOWERCASE])");
  });

  it("emits Normalise::applyNullable on a nullable String field", async () => {
    const annotations = withAnnotations({ normalise: ["trim"] as NormaliseOp[] });
    const { ctx, writer } = makeContext([
      model("User", [field("nickname", scalar("String"), { isRequired: false, annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("Normalise::applyNullable($value, [Normalise::TRIM])");
  });

  it("does not wrap Normalise::applyNullable in a null-guard (the helper is already null-safe)", async () => {
    const annotations = withAnnotations({ normalise: ["trim"] as NormaliseOp[] });
    const { ctx, writer } = makeContext([
      model("User", [field("nickname", scalar("String"), { isRequired: false, annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    // The setter routes nullable strings through applyNullable directly —
    // no redundant `$value === null ? null : ...` wrap, because the helper
    // already short-circuits on null. Cross-type coerce (e.g. Int) still
    // wraps, because Coerce::int would throw on null.
    expect(out).not.toContain("$value === null ? null : Normalise::applyNullable");
  });

  it("supports nullEmptyToNull on a nullable String field", async () => {
    const annotations = withAnnotations({
      normalise: ["trim", "nullEmptyToNull"] as NormaliseOp[],
    });
    const { ctx, writer } = makeContext([
      model("User", [field("alias", scalar("String"), { isRequired: false, annotations })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("Normalise::NULL_EMPTY_TO_NULL");
  });

  it("errors when nullEmptyToNull is applied to a required String field", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({
      normalise: ["nullEmptyToNull"] as NormaliseOp[],
    });
    const { ctx } = makeContext([model("M", [field("name", scalar("String"), { annotations })])]);
    await expect(
      emitPhpModels(ctx, {
        declarationStyle: "domain-class",
        onDiagnostic: (d) => issues.push(d),
      }),
    ).rejects.toThrow(/PolyPrism: PHP emit failed/);
    expect(
      issues.some((i) => i.severity === "error" && i.message.includes("nullEmptyToNull")),
    ).toBe(true);
  });

  it("warns when @normalise is applied to a non-String field (silently ignored)", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({ normalise: ["trim"] as NormaliseOp[] });
    const { ctx, writer } = makeContext([
      model("M", [field("count", scalar("Int"), { annotations })]),
    ]);
    await emitPhpModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => issues.push(d),
    });
    const out = writer.files.get("Models/M.php")!;
    expect(out).not.toContain("Normalise::");
    expect(
      issues.some(
        (i) => i.severity === "warning" && i.message.includes("@normalise has no effect"),
      ),
    ).toBe(true);
  });
});

// ---------- nullable + coerce ----------

describe("php-domain-class — nullability", () => {
  it("widens the setter param to include null for a nullable Int field", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("points", scalar("Int"), { isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public ?int $points = null");
    expect(out).toContain("set(int|string|null $value)");
    expect(out).toContain("$value === null ? null : Coerce::int");
  });

  it("does NOT add a null-guard wrap for a strict nullable field with no work", async () => {
    // Strict + no normalise + nullable → plain typed property, no hook.
    const { ctx, writer } = makeContext([
      model("M", [field("name", scalar("String"), { isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public ?string $name = null;");
    expect(out).not.toContain("$value === null");
  });
});

// ---------- lists short-circuit to strict ----------

describe("php-domain-class — lists", () => {
  it("emits a plain array property with no hook, regardless of element type", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("tags", scalar("Int"), { isList: true })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public array $tags = [];");
    expect(out).not.toContain("set(");
    expect(out).not.toContain("Coerce::");
  });

  it("warns when @coerce / @normalise are applied to a list field", async () => {
    const issues: Diagnostic[] = [];
    const annotations = withAnnotations({ normalise: ["trim"] as NormaliseOp[] });
    const { ctx } = makeContext([
      model("M", [field("tags", scalar("String"), { isList: true, annotations })]),
    ]);
    await emitPhpModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => issues.push(d),
    });
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("list fields"))).toBe(
      true,
    );
  });
});

// ---------- defaults ----------

describe("php-domain-class — defaults", () => {
  it("emits literal Int default on both property AND constructor param", async () => {
    const { ctx, writer } = makeContext([
      model("M", [field("points", scalar("Int"), { hasDefaultValue: true, default: litInt(0) })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public int $points = 0 {");
    expect(out).toContain("int|string $points = 0,");
  });

  it("emits literal String default with single-quote escaping", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("label", scalar("String"), {
          hasDefaultValue: true,
          default: litStr("hello"),
        }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public string $label = 'hello'");
  });

  it("emits now() default as new \\DateTimeImmutable()", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("when", scalar("DateTime"), {
          hasDefaultValue: true,
          default: { kind: "function", name: "now", args: [] },
        }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("new \\DateTimeImmutable()");
  });
});

// ---------- mixed type handling (Json fields without @json) ----------

describe("php-domain-class — Json fields without @json annotation", () => {
  it("emits plain `mixed` for a nullable Json field (not `?mixed` — PHP syntax error)", async () => {
    // `mixed` already includes null in PHP's type system. Emitting `?mixed`
    // is a hard PHP parse error. Caught against a real-world Zonos schema.
    const { ctx, writer } = makeContext([
      model("M", [field("payload", scalar("Json"), { isRequired: false })]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public mixed $payload");
    expect(out).not.toContain("?mixed");
  });

  it("emits plain `mixed` for a required Json field", async () => {
    const { ctx, writer } = makeContext([model("M", [field("payload", scalar("Json"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("public mixed $payload");
  });
});

// ---------- from() factory ----------

describe("php-domain-class — from() factory", () => {
  it("emits a static from(array $data): self method", async () => {
    const { ctx, writer } = makeContext([
      model("User", [field("id", scalar("String")), field("email", scalar("String"))]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain("public static function from(array $data): self");
    expect(out).toContain("return new self(");
  });

  it("throws TypeError with field path on missing required field", async () => {
    const { ctx, writer } = makeContext([model("Customer", [field("id", scalar("String"))])]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/Customer.php")!;
    expect(out).toContain(
      `id: $data['id'] ?? throw new \\TypeError('Customer::from(): missing required field "id"'),`,
    );
  });

  it("falls through to default expression for optional/defaulted fields", async () => {
    const { ctx, writer } = makeContext([
      model("User", [
        field("id", scalar("String")),
        field("points", scalar("Int"), { hasDefaultValue: true, default: litInt(0) }),
        field("name", scalar("String"), { isRequired: false }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/User.php")!;
    expect(out).toContain(`points: $data['points'] ?? 0,`);
    expect(out).toContain(`name: $data['name'] ?? null,`);
  });

  it("orders from() args matching the constructor (required-first, optional-second)", async () => {
    const { ctx, writer } = makeContext([
      model("M", [
        field("optional", scalar("String"), { isRequired: false }),
        field("required", scalar("String")),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    const fromBlock = out.slice(out.indexOf("public static function from"));
    const requiredIdx = fromBlock.indexOf(`required: $data['required']`);
    const optionalIdx = fromBlock.indexOf(`optional: $data['optional']`);
    expect(requiredIdx).toBeGreaterThan(0);
    expect(optionalIdx).toBeGreaterThan(0);
    expect(requiredIdx).toBeLessThan(optionalIdx);
  });

  it("omits @hide fields from the from() signature entirely", async () => {
    const hideAnnotations = withAnnotations({ hide: true });
    const { ctx, writer } = makeContext([
      model("M", [
        field("id", scalar("String")),
        field("secret", scalar("String"), { annotations: hideAnnotations }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    const fromBlock = out.slice(out.indexOf("public static function from"));
    expect(fromBlock).toContain("id:");
    expect(fromBlock).not.toContain("secret:");
  });
});

// ---------- @hide ----------

describe("php-domain-class — @hide", () => {
  it("omits hidden fields from properties and constructor entirely", async () => {
    const hideAnnotations = withAnnotations({ hide: true });
    const { ctx, writer } = makeContext([
      model("M", [
        field("id", scalar("String")),
        field("secret", scalar("String"), { annotations: hideAnnotations }),
      ]),
    ]);
    await emitPhpModels(ctx, { declarationStyle: "domain-class" });
    const out = writer.files.get("Models/M.php")!;
    expect(out).toContain("$id");
    expect(out).not.toContain("$secret");
  });
});
