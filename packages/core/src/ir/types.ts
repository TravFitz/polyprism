// Language-agnostic intermediate representation for OmniPrism.
// Designed so a future PHP (or Go, Rust, ...) emitter can consume the same IR
// without needing to understand DMMF.

export type ScalarType =
  | "String"
  | "Boolean"
  | "Int"
  | "BigInt"
  | "Float"
  | "Decimal"
  | "DateTime"
  | "Json"
  | "Bytes";

export type ReferentialAction = "Cascade" | "Restrict" | "NoAction" | "SetNull" | "SetDefault";

export interface NativeType {
  readonly name: string;
  readonly args: readonly string[];
}

export type FieldType =
  | { readonly kind: "scalar"; readonly scalar: ScalarType }
  | { readonly kind: "enum"; readonly enumName: string }
  | {
      readonly kind: "relation";
      readonly modelName: string;
      readonly relationName: string | null;
      readonly relationFromFields: readonly string[];
      readonly relationToFields: readonly string[];
      readonly onDelete: ReferentialAction | null;
      readonly onUpdate: ReferentialAction | null;
    }
  | { readonly kind: "unsupported"; readonly raw: string };

export type DefaultValue =
  | { readonly kind: "literal"; readonly value: string | number | boolean | null }
  | { readonly kind: "function"; readonly name: string; readonly args: readonly unknown[] }
  | { readonly kind: "list"; readonly values: readonly unknown[] };

export type NormaliseOp = "trim" | "lowercase" | "uppercase" | "nullEmptyToNull";

export type CoerceTo = "date" | "int" | "float" | "decimal" | "string";

export type JsonAnnotation =
  | { readonly kind: "bare"; readonly typeName: string }
  | { readonly kind: "with-path"; readonly typeName: string; readonly importPath: string }
  | { readonly kind: "inline-anonymous"; readonly typeExpression: string }
  | {
      readonly kind: "inline-named";
      readonly typeName: string;
      readonly typeExpression: string;
    };

export interface TypeOverride {
  readonly typeName: string;
  readonly importPath: string | null;
}

export interface DeprecatedInfo {
  readonly reason: string | null;
}

export interface AnnotationSet {
  hide: boolean;
  deprecated: DeprecatedInfo | null;
  json: JsonAnnotation | null;
  type: TypeOverride | null;
  name: string | null;
  normalise: readonly NormaliseOp[] | null;
  coerce: CoerceTo | null;
  /** Documentation text stripped of annotation lines; preserved for JSDoc emission. */
  documentation: string | null;
  /** Raw annotation source kept for debugging / unknown-annotation warnings. */
  rawAnnotations: readonly string[];
}

export interface FieldDef {
  readonly name: string;
  readonly dbName: string | null;
  readonly type: FieldType;
  readonly isList: boolean;
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly isId: boolean;
  readonly isUpdatedAt: boolean;
  readonly hasDefaultValue: boolean;
  readonly default: DefaultValue | null;
  readonly documentation: string | null;
  readonly annotations: AnnotationSet;
  readonly nativeType: NativeType | null;
}

export interface PrimaryKeyDef {
  readonly name: string | null;
  readonly fields: readonly string[];
}

export interface UniqueIndexDef {
  readonly name: string | null;
  readonly fields: readonly string[];
}

export interface IndexDef {
  readonly name: string | null;
  readonly fields: readonly string[];
}

export interface ModelDef {
  readonly name: string;
  readonly dbName: string | null;
  readonly documentation: string | null;
  readonly fields: readonly FieldDef[];
  readonly primaryKey: PrimaryKeyDef | null;
  readonly uniqueIndexes: readonly UniqueIndexDef[];
  readonly indexes: readonly IndexDef[];
  readonly annotations: AnnotationSet;
}

export interface EnumValueDef {
  readonly name: string;
  readonly dbName: string | null;
  readonly documentation: string | null;
  readonly annotations: AnnotationSet;
}

export interface EnumDef {
  readonly name: string;
  readonly dbName: string | null;
  readonly documentation: string | null;
  readonly values: readonly EnumValueDef[];
  readonly annotations: AnnotationSet;
}

export interface OmniPrismIR {
  readonly models: readonly ModelDef[];
  readonly enums: readonly EnumDef[];
}

/**
 * Returns an AnnotationSet with no annotations parsed.
 * Used as the baseline before the annotation parser (Task 3) runs.
 */
export function emptyAnnotationSet(documentation: string | null): AnnotationSet {
  return {
    hide: false,
    deprecated: null,
    json: null,
    type: null,
    name: null,
    normalise: null,
    coerce: null,
    documentation,
    rawAnnotations: [],
  };
}
