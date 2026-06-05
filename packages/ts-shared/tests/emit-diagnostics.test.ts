// Diagnostic surface for emit-time issues — added in v0.2 polish.
//
// Two prior failure modes are tested here:
//
//   1. AnnotationSet.parseIssues — issues recorded by the parser when an
//      annotation is malformed. Pre-polish: stored on the IR, never read.
//      Post-polish: flow through onDiagnostic with model.field context.
//
//   2. CoerceRulesIssue — issues from coerce-rules.ts validating domain-class
//      annotations against the field's declared type. Pre-polish: dropped at
//      render-model.ts:50 in favour of returning a string. Post-polish:
//      mapped to Diagnostic shape and reported.
//
// Errors at any layer now throw at the end of emitModels. The previously
// silent "constructor" / "__proto__" reserved-name cases also flow through
// this same path — see the reserved-name tests in
// `emit-domain-class-style.test.ts`, which now assert on the throw + the
// diagnostic instead of inferring a drop via missing-substring checks.

import {
  createInMemoryFileWriter,
  DEFAULT_NAMING,
  emptyAnnotationSet,
  type FieldDef,
  type GeneratorContext,
  type ModelDef,
  parseAnnotations,
} from "@polyprism/core";
import { describe, expect, it, vi } from "vitest";

import type { Diagnostic } from "../src/diagnostics.js";
import { emitModels } from "../src/emit-models.js";

function field(
  name: string,
  scalar: "String" | "Int" | "Boolean",
  documentation?: string,
): FieldDef {
  const annotations = documentation ? parseAnnotations(documentation) : emptyAnnotationSet(null);
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
    documentation: documentation ?? null,
    annotations,
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
} {
  const diagnostics: Diagnostic[] = [];
  const ctx: GeneratorContext = {
    ir: { models, enums: [] },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer: createInMemoryFileWriter(),
  };
  return { ctx, diagnostics };
}

describe("emit-time diagnostics — parser issues", () => {
  it("surfaces a parser warning with model.field context when @noCoerce is called with args", async () => {
    const { ctx, diagnostics } = makeContext([
      model("User", [field("id", "String"), field("count", "Int", "@noCoerce(int)")]),
    ]);

    await emitModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => diagnostics.push(d),
    });

    const issue = diagnostics.find((d) => d.context === "User.count");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("@noCoerce takes no arguments");
  });

  it("calls onDiagnostic zero times for a clean schema", async () => {
    const { ctx } = makeContext([model("User", [field("id", "String"), field("email", "String")])]);

    const onDiagnostic = vi.fn<(d: Diagnostic) => void>();
    await emitModels(ctx, { declarationStyle: "domain-class", onDiagnostic });

    expect(onDiagnostic).not.toHaveBeenCalled();
  });
});

describe("emit-time diagnostics — coerce-rules issues", () => {
  it("surfaces a warning when @noCoerce is applied to a strict-by-default type (String)", async () => {
    const { ctx, diagnostics } = makeContext([
      model("User", [
        field("id", "String"),
        // @noCoerce is a no-op on String (already strict) — coerce-rules
        // emits a warning so the user knows the annotation didn't do
        // anything.
        field("email", "String", "@noCoerce"),
      ]),
    ]);

    await emitModels(ctx, {
      declarationStyle: "domain-class",
      onDiagnostic: (d) => diagnostics.push(d),
    });

    const issue = diagnostics.find((d) => d.context === "User.email" && d.severity === "warning");
    expect(issue).toBeDefined();
    expect(issue?.message.toLowerCase()).toContain("strict by default");
  });

  it("throws at the end of emitModels when any diagnostic is error-severity", async () => {
    const { ctx, diagnostics } = makeContext([
      model("User", [
        field("id", "String"),
        // @coerce(int) on a Boolean is nonsensical — coerce-rules emits an
        // error because there's no honest default for which string maps to
        // which boolean.
        field("active", "Boolean", "@coerce(int)"),
      ]),
    ]);

    await expect(
      emitModels(ctx, {
        declarationStyle: "domain-class",
        onDiagnostic: (d) => diagnostics.push(d),
      }),
    ).rejects.toThrow(/error-severity diagnostic/);

    const errorIssue = diagnostics.find((d) => d.severity === "error");
    expect(errorIssue?.context).toBe("User.active");
  });
});

describe("emit-time diagnostics — non-domain-class styles emit no issues today", () => {
  it("emits zero diagnostics for interface style even when @noCoerce is present", async () => {
    const { ctx } = makeContext([
      model("User", [field("id", "String"), field("count", "Int", "@noCoerce")]),
    ]);

    const onDiagnostic = vi.fn<(d: Diagnostic) => void>();
    await emitModels(ctx, { declarationStyle: "interface", onDiagnostic });

    // ts-interface ignores @coerce / @noCoerce / @normalise entirely — no
    // emit-time validation runs against them. Parser issues would still be
    // reported, but plain `@noCoerce` doesn't trigger a parse issue.
    expect(onDiagnostic).not.toHaveBeenCalled();
  });
});
