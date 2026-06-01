export type FileNamingConvention =
  | "PascalCase"
  | "camelCase"
  | "kebab-case"
  | "snake_case"
  | "preserve";

export type TypeNamingConvention = "PascalCase" | "camelCase" | "snake_case" | "preserve";

export type FieldNamingConvention = "camelCase" | "snake_case" | "preserve";

export interface NamingConfig {
  readonly fileNaming: FileNamingConvention;
  readonly typeNaming: TypeNamingConvention;
  readonly fieldNaming: FieldNamingConvention;
}

export const DEFAULT_NAMING: NamingConfig = {
  fileNaming: "PascalCase",
  typeNaming: "PascalCase",
  fieldNaming: "preserve",
};
