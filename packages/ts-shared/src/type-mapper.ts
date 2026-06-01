// Maps an IR FieldDef to its TypeScript type expression.
//
// Resolution order (highest to lowest priority):
//   1. @type(...)            — explicit override, used verbatim
//   2. @json(...) (Json only) — branded JSON field type (4 sub-forms)
//   3. Default mapping        — from IR scalar/enum/relation kind
//
// All paths funnel through wrapNullability() so list-ness and nullability
// are applied consistently at the end.

import type { FieldDef, NamingConfig, ScalarType } from "@polyprism/core";
import { autoNameInlineJson, resolveTypeFilename } from "@polyprism/core";

import type { ImportCollector } from "./imports.js";

export interface TypeMapperOptions {
  readonly field: FieldDef;
  readonly modelSchemaName: string;
  readonly imports: ImportCollector;
  readonly naming: NamingConfig;
  readonly enumLookup: ReadonlyMap<string, string>;
  readonly modelLookup: ReadonlyMap<string, string>;
  readonly selfModelIdent: string;
}

export function mapFieldTsType(opts: TypeMapperOptions): string {
  const base = mapBaseTypeExpression(opts);
  return wrapNullability(base, opts.field);
}

function mapBaseTypeExpression(opts: TypeMapperOptions): string {
  const { field } = opts;

  // (1) @type override
  if (field.annotations.type) {
    const { typeName, importPath } = field.annotations.type;
    if (importPath) opts.imports.add(importPath, typeName);
    return typeName;
  }

  // (2) @json on Json field
  if (field.type.kind === "scalar" && field.type.scalar === "Json" && field.annotations.json) {
    return mapJsonAnnotation(opts);
  }

  // (3) Default mapping from IR field type
  switch (field.type.kind) {
    case "scalar":
      return mapScalar(field.type.scalar, opts.imports);
    case "enum":
      return mapEnumReference(field.type.enumName, opts);
    case "relation":
      return mapRelationReference(field.type.modelName, opts);
    case "unsupported":
      return "unknown";
  }
}

function mapJsonAnnotation(opts: TypeMapperOptions): string {
  const json = opts.field.annotations.json;
  if (!json) return "unknown";
  switch (json.kind) {
    case "bare":
      // User is responsible for the type being importable — emit no import.
      return json.typeName;
    case "with-path":
      opts.imports.add(json.importPath, json.typeName);
      return json.typeName;
    case "inline-anonymous": {
      const typeName = autoNameInlineJson(opts.modelSchemaName, opts.field.name);
      const filename = resolveTypeFilename(typeName, opts.naming.fileNaming);
      opts.imports.add(`./json-types/${filename}.js`, typeName);
      return typeName;
    }
    case "inline-named": {
      const filename = resolveTypeFilename(json.typeName, opts.naming.fileNaming);
      opts.imports.add(`./json-types/${filename}.js`, json.typeName);
      return json.typeName;
    }
  }
}

function mapEnumReference(schemaName: string, opts: TypeMapperOptions): string {
  const ident = opts.enumLookup.get(schemaName) ?? schemaName;
  const filename = resolveTypeFilename(ident, opts.naming.fileNaming);
  opts.imports.add(`./enums/${filename}.js`, ident);
  return ident;
}

function mapRelationReference(schemaName: string, opts: TypeMapperOptions): string {
  const ident = opts.modelLookup.get(schemaName) ?? schemaName;
  // Skip self-imports — the model already references itself in scope.
  if (ident === opts.selfModelIdent) return ident;
  const filename = resolveTypeFilename(ident, opts.naming.fileNaming);
  opts.imports.add(`./${filename}.js`, ident);
  return ident;
}

function mapScalar(scalar: ScalarType, imports: ImportCollector): string {
  switch (scalar) {
    case "String":
      return "string";
    case "Boolean":
      return "boolean";
    case "Int":
    case "Float":
      return "number";
    case "BigInt":
      return "bigint";
    case "Decimal":
      imports.add("@prisma/client/runtime/library", "Decimal");
      return "Decimal";
    case "DateTime":
      return "Date";
    case "Json":
      imports.add("@prisma/client/runtime/library", "JsonValue");
      return "JsonValue";
    case "Bytes":
      return "Uint8Array";
  }
}

function wrapNullability(base: string, field: FieldDef): string {
  if (field.isList) {
    // Prisma lists are arrays of the base type; never null at the TS level.
    // (Prisma returns `[]` for empty lists, not `null`.)
    return `${base}[]`;
  }
  if (!field.isRequired) {
    return `${base} | null`;
  }
  return base;
}
