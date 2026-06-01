// Parse the generator-block `config` field (a Record<string, string | string[]>)
// into a strongly-typed PolyPrismConfig. Unknown keys are ignored; invalid
// values fall back to defaults silently in v0.1 (we can add warnings later).

import type {
  FieldNamingConvention,
  FileNamingConvention,
  NamingConfig,
  TypeNamingConvention,
} from "../naming/types.js";
import { DEFAULT_NAMING } from "../naming/types.js";

export interface PolyPrismConfig {
  readonly naming: NamingConfig;
  readonly emitIndex: boolean;
}

const FILE_NAMING_VALUES: ReadonlySet<FileNamingConvention> = new Set([
  "PascalCase",
  "camelCase",
  "kebab-case",
  "snake_case",
  "preserve",
]);

const TYPE_NAMING_VALUES: ReadonlySet<TypeNamingConvention> = new Set([
  "PascalCase",
  "camelCase",
  "snake_case",
  "preserve",
]);

const FIELD_NAMING_VALUES: ReadonlySet<FieldNamingConvention> = new Set([
  "camelCase",
  "snake_case",
  "preserve",
]);

export type RawGeneratorConfig = Record<string, string | string[] | undefined>;

export function parseGeneratorConfig(raw: RawGeneratorConfig): PolyPrismConfig {
  return {
    naming: {
      fileNaming: pickEnum(raw, "fileNaming", FILE_NAMING_VALUES, DEFAULT_NAMING.fileNaming),
      typeNaming: pickEnum(raw, "typeNaming", TYPE_NAMING_VALUES, DEFAULT_NAMING.typeNaming),
      fieldNaming: pickEnum(raw, "fieldNaming", FIELD_NAMING_VALUES, DEFAULT_NAMING.fieldNaming),
    },
    emitIndex: pickBool(raw, "emitIndex", false),
  };
}

function pickEnum<T extends string>(
  raw: RawGeneratorConfig,
  key: string,
  allowed: ReadonlySet<T>,
  fallback: T,
): T {
  const value = raw[key];
  if (typeof value !== "string") return fallback;
  return allowed.has(value as T) ? (value as T) : fallback;
}

function pickBool(raw: RawGeneratorConfig, key: string, fallback: boolean): boolean {
  const value = raw[key];
  if (typeof value !== "string") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
