// Naming resolution: applies the project's naming config to schema identifiers,
// honouring `@name(...)` per-identifier overrides.
//
// Rules:
//   - `@name(X)` overrides the identifier verbatim. The override is the
//     identifier; filenames are still derived from it via fileNaming.
//   - Without an override, the schema identifier is transformed via the
//     relevant axis (typeNaming for models/enums, fieldNaming for fields).
//   - Filenames are always derived from the *resolved* type identifier via
//     fileNaming, regardless of override source.

import { toCamelCase, toKebabCase, toPascalCase, toSnakeCase } from "./casing.js";
import type { FieldNamingConvention, FileNamingConvention, TypeNamingConvention } from "./types.js";

export function applyTypeConvention(input: string, convention: TypeNamingConvention): string {
  switch (convention) {
    case "PascalCase":
      return toPascalCase(input);
    case "camelCase":
      return toCamelCase(input);
    case "snake_case":
      return toSnakeCase(input);
    case "preserve":
      return input;
  }
}

export function applyFieldConvention(input: string, convention: FieldNamingConvention): string {
  switch (convention) {
    case "camelCase":
      return toCamelCase(input);
    case "snake_case":
      return toSnakeCase(input);
    case "preserve":
      return input;
  }
}

export function applyFileConvention(input: string, convention: FileNamingConvention): string {
  switch (convention) {
    case "PascalCase":
      return toPascalCase(input);
    case "camelCase":
      return toCamelCase(input);
    case "kebab-case":
      return toKebabCase(input);
    case "snake_case":
      return toSnakeCase(input);
    case "preserve":
      return input;
  }
}

export interface ResolveTypeIdent {
  schemaName: string;
  override: string | null;
  convention: TypeNamingConvention;
}

export function resolveTypeIdent(args: ResolveTypeIdent): string {
  return args.override ?? applyTypeConvention(args.schemaName, args.convention);
}

export interface ResolveFieldIdent {
  schemaName: string;
  override: string | null;
  convention: FieldNamingConvention;
}

export function resolveFieldIdent(args: ResolveFieldIdent): string {
  return args.override ?? applyFieldConvention(args.schemaName, args.convention);
}

export function resolveTypeFilename(typeIdent: string, convention: FileNamingConvention): string {
  return applyFileConvention(typeIdent, convention);
}

/**
 * Auto-name an inline-anonymous JSON type. Always PascalCase derived from
 * the model and field schema names — the project's typeNaming applies
 * separately when the resulting name is referenced as a type identifier.
 */
export function autoNameInlineJson(modelSchemaName: string, fieldSchemaName: string): string {
  return toPascalCase(modelSchemaName) + toPascalCase(fieldSchemaName);
}
