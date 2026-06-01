// Renders one Prisma model as a TypeScript declaration.
//
// Three declaration styles supported via `declarationStyle`:
//   "interface" → `export interface User { ... }`
//   "type"      → `export type User = { ... };`
//   "class"     → `export class User { id!: string; name: string | null = null; }`
//
// All styles share field rendering, import collection, JSDoc emission, and
// naming resolution. The "class" style additionally renders default-value
// initializers (`= value`) for fields that have a TS-representable default,
// and a definite-assignment assertion (`!`) for required fields without one.

import type {
  FieldDef,
  ModelDef,
  NamingConfig,
  OmniPrismConfig,
  OmniPrismIR,
} from "@omniprism/core";
import { resolveFieldIdent, resolveTypeFilename, resolveTypeIdent } from "@omniprism/core";

import { ImportCollector } from "./imports.js";
import { renderJsDoc } from "./jsdoc.js";
import { mapFieldTsType } from "./type-mapper.js";

export type DeclarationStyle = "interface" | "type" | "class";

export interface RenderModelOptions {
  readonly model: ModelDef;
  readonly ir: OmniPrismIR;
  readonly config: OmniPrismConfig;
  readonly declarationStyle: DeclarationStyle;
}

export function renderModel(opts: RenderModelOptions): string {
  const { model, ir, config, declarationStyle } = opts;

  // Pre-resolve enum and model identifiers so each field lookup is O(1).
  const enumLookup = new Map<string, string>(
    ir.enums.map((e) => [
      e.name,
      resolveTypeIdent({
        schemaName: e.name,
        override: e.annotations.name,
        convention: config.naming.typeNaming,
      }),
    ]),
  );
  const modelLookup = new Map<string, string>(
    ir.models.map((m) => [
      m.name,
      resolveTypeIdent({
        schemaName: m.name,
        override: m.annotations.name,
        convention: config.naming.typeNaming,
      }),
    ]),
  );

  const selfIdent = modelLookup.get(model.name) ?? model.name;

  const imports = new ImportCollector();
  const fieldLines: string[] = [];

  for (const field of model.fields) {
    if (field.annotations.hide) continue;

    const fieldIdent = resolveFieldIdent({
      schemaName: field.name,
      override: field.annotations.name,
      convention: config.naming.fieldNaming,
    });

    const tsType = mapFieldTsType({
      field,
      modelSchemaName: model.name,
      imports,
      naming: config.naming,
      enumLookup,
      modelLookup,
      selfModelIdent: selfIdent,
    });

    const extraTags = buildFieldExtraTags(field);
    const docBlock = renderJsDoc(field.annotations, { indent: 2, extraTags });

    const fieldLine =
      declarationStyle === "class"
        ? renderClassFieldLine(field, fieldIdent, tsType, {
            enumLookup,
            imports,
            naming: config.naming,
          })
        : `  ${fieldIdent}: ${tsType};`;

    fieldLines.push(`${docBlock}${fieldLine}`);
  }

  const headerDoc = renderJsDoc(model.annotations, { indent: 0 });
  const importBlock = imports.render();
  const body = fieldLines.length > 0 ? `\n${fieldLines.join("\n")}\n` : "\n";

  switch (declarationStyle) {
    case "interface":
      return `${importBlock}${headerDoc}export interface ${selfIdent} {${body}}\n`;
    case "type":
      return `${importBlock}${headerDoc}export type ${selfIdent} = {${body}};\n`;
    case "class":
      return `${importBlock}${headerDoc}export class ${selfIdent} {${body}}\n`;
  }
}

interface ClassRenderCtx {
  readonly enumLookup: ReadonlyMap<string, string>;
  readonly imports: ImportCollector;
  readonly naming: NamingConfig;
}

function renderClassFieldLine(
  field: FieldDef,
  fieldIdent: string,
  tsType: string,
  ctx: ClassRenderCtx,
): string {
  const defaultExpr = formatClassDefault(field, ctx);
  if (defaultExpr === null) {
    return `  ${fieldIdent}!: ${tsType};`;
  }
  return `  ${fieldIdent}: ${tsType} = ${defaultExpr};`;
}

// Returns a TS expression for the field's initial value, or null if no
// representable default exists (in which case the class uses a `!` definite
// assignment assertion).
//
// Critically, this only emits a TS literal when the scalar kind matches the
// literal kind — fixing the long-standing prisma-class-generator bug where an
// `Int @default(90)` on a DateTime field got fed to `Date.parse("90")` and
// produced a NaN-time Date in the emitted class.
function formatClassDefault(field: FieldDef, ctx: ClassRenderCtx): string | null {
  // Lists always default to an empty array — Prisma returns [] for empty,
  // never null.
  if (field.isList) return "[]";

  // Nullable scalars with no Prisma default still need an initializer so
  // strict class-field checks pass without `!`. Mirrors prisma-class-generator
  // behaviour and lines up with the plan's example output.
  if (!field.isRequired && !field.hasDefaultValue) return "null";

  if (!field.hasDefaultValue || !field.default) return null;

  const d = field.default;

  if (d.kind === "literal") {
    return formatLiteralDefault(field, d.value, ctx);
  }

  if (d.kind === "list") {
    // Defensive: scalar lists with @default([...]) are rare. We've already
    // emitted [] for any isList field above; if we reach this branch with
    // a non-list field carrying a list default, the schema is unusual and
    // we don't try to be clever.
    return "[]";
  }

  // function defaults: cuid(), uuid(), now(), autoincrement(), dbgenerated(),
  // etc. None has a stable, dep-free TS literal — Prisma assigns these at
  // insert time. Fall through to the `!` path.
  return null;
}

function formatLiteralDefault(
  field: FieldDef,
  value: string | number | boolean | null,
  ctx: ClassRenderCtx,
): string | null {
  if (value === null) return "null";

  if (typeof value === "string") {
    if (field.type.kind === "scalar" && field.type.scalar === "String") {
      return JSON.stringify(value);
    }
    if (field.type.kind === "enum") {
      const enumIdent = ctx.enumLookup.get(field.type.enumName);
      if (!enumIdent) return null;
      // The enum is referenced as a runtime value here (`Status.PENDING`),
      // so the type-only import the type-mapper added must be promoted.
      const filename = resolveTypeFilename(enumIdent, ctx.naming.fileNaming);
      ctx.imports.addValue(`./enums/${filename}.js`, enumIdent);
      return `${enumIdent}.${value}`;
    }
    // String literal default on a non-String/non-enum field is the exact
    // shape that produced the prisma-class-generator integer-default-Date
    // bug. Refuse to fabricate a value — fall through to `!`.
    return null;
  }

  if (typeof value === "number") {
    if (
      field.type.kind === "scalar" &&
      (field.type.scalar === "Int" || field.type.scalar === "Float")
    ) {
      return String(value);
    }
    // BigInt/Decimal/DateTime numeric defaults need wrapping (BigInt(...),
    // new Decimal(...), new Date(...)) and pull in runtime imports we'd
    // rather not require by default. Skip cleanly.
    return null;
  }

  if (typeof value === "boolean") {
    if (field.type.kind === "scalar" && field.type.scalar === "Boolean") {
      return value ? "true" : "false";
    }
    return null;
  }

  return null;
}

// JSDoc tag lines derived from non-annotation field metadata. Currently only
// surfaces Prisma `@db.X(...)` native-type info — kept in JSDoc rather than
// the TS type because `decimal.js` (the Decimal runtime) has no precision
// generics, so `Decimal(19, 2)` and `Decimal(8, 4)` are the same TS type but
// usefully different at the schema/DB layer.
function buildFieldExtraTags(field: {
  nativeType: { name: string; args: readonly string[] } | null;
}): string[] {
  const tags: string[] = [];
  if (field.nativeType) {
    const args = field.nativeType.args.join(", ");
    tags.push(args ? `@db.${field.nativeType.name}(${args})` : `@db.${field.nativeType.name}`);
  }
  return tags;
}
