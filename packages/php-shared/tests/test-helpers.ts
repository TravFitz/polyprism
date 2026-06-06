// Shared fixture builders for the PHP renderer test suites. Both
// `emit-class-style.test.ts` (php-class / php-readonly) and
// `emit-domain-class-style.test.ts` (php-domain-class) hand-roll IR shapes
// to drive the emitter — the builders here keep that scaffolding in one
// place so signature drift between the two test files can't happen.

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

export interface FieldOverrides {
  isList?: boolean;
  isRequired?: boolean;
  hasDefaultValue?: boolean;
  default?: DefaultValue | null;
  annotations?: AnnotationSet;
  documentation?: string;
}

export type ScalarName =
  | "String"
  | "Int"
  | "Float"
  | "Boolean"
  | "DateTime"
  | "BigInt"
  | "Decimal"
  | "Json"
  | "Bytes";

export function field(name: string, type: FieldType, o: FieldOverrides = {}): FieldDef {
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

export function scalar(s: ScalarName): FieldType {
  return { kind: "scalar", scalar: s };
}

export function enumRef(name: string): FieldType {
  return { kind: "enum", enumName: name };
}

export function relation(modelName: string): FieldType {
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

export function model(name: string, fields: FieldDef[]): ModelDef {
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

export function enumDef(name: string, values: string[]): EnumDef {
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

export function makeContext(models: ModelDef[], enums: EnumDef[] = []) {
  const writer = createInMemoryFileWriter();
  const ctx: GeneratorContext = {
    ir: { models, enums },
    config: { naming: DEFAULT_NAMING, emitIndex: false },
    outputDir: "/v",
    writer,
  };
  return { ctx, writer };
}

export function withAnnotations(overrides: Partial<AnnotationSet>): AnnotationSet {
  return { ...emptyAnnotationSet(null), ...overrides };
}

// Common DefaultValue factories — keep the test files terse.
export const litInt = (v: number): DefaultValue => ({ kind: "literal", value: v });
export const litStr = (v: string): DefaultValue => ({ kind: "literal", value: v });
export const litBool = (v: boolean): DefaultValue => ({ kind: "literal", value: v });
export const nowDefault = (): DefaultValue => ({ kind: "function", name: "now", args: [] });
export const cuidDefault = (): DefaultValue => ({ kind: "function", name: "cuid", args: [] });
