// DMMF → OmniPrism IR.
//
// ⚠️ This is the single isolation point for Prisma's `@prisma/generator-helper`.
// DMMF is officially unstable; when Prisma ships its stable generator API
// (announced for a future release), THIS file is the only one that should change.
// The IR consumed by emitters stays the same.

import type { DMMF } from "@prisma/generator-helper";

import type {
  DefaultValue,
  EnumDef,
  EnumValueDef,
  FieldDef,
  FieldType,
  IndexDef,
  ModelDef,
  NativeType,
  OmniPrismIR,
  PrimaryKeyDef,
  ReferentialAction,
  ScalarType,
  UniqueIndexDef,
} from "../ir/types.js";
import { emptyAnnotationSet } from "../ir/types.js";

const SCALAR_TYPES: ReadonlySet<ScalarType> = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

function isScalarType(s: string): s is ScalarType {
  return SCALAR_TYPES.has(s as ScalarType);
}

const REFERENTIAL_ACTIONS: ReadonlySet<ReferentialAction> = new Set([
  "Cascade",
  "Restrict",
  "NoAction",
  "SetNull",
  "SetDefault",
]);

function asReferentialAction(s: string | undefined | null): ReferentialAction | null {
  if (s == null) return null;
  return REFERENTIAL_ACTIONS.has(s as ReferentialAction) ? (s as ReferentialAction) : null;
}

function mapFieldType(field: DMMF.Field): FieldType {
  switch (field.kind) {
    case "scalar":
      if (isScalarType(field.type)) {
        return { kind: "scalar", scalar: field.type };
      }
      return { kind: "unsupported", raw: field.type };
    case "enum":
      return { kind: "enum", enumName: field.type };
    case "object":
      return {
        kind: "relation",
        modelName: field.type,
        relationName: field.relationName ?? null,
        relationFromFields: field.relationFromFields ?? [],
        relationToFields: field.relationToFields ?? [],
        onDelete: asReferentialAction(field.relationOnDelete),
        onUpdate: asReferentialAction(field.relationOnUpdate),
      };
    case "unsupported":
      return { kind: "unsupported", raw: field.type };
  }
}

function mapDefault(field: DMMF.Field): DefaultValue | null {
  if (!field.hasDefaultValue || field.default === undefined) return null;
  const def = field.default;
  if (
    def === null ||
    typeof def === "string" ||
    typeof def === "number" ||
    typeof def === "boolean"
  ) {
    return { kind: "literal", value: def };
  }
  if (Array.isArray(def)) {
    return { kind: "list", values: def };
  }
  if (typeof def === "object" && "name" in def && "args" in def) {
    const fnDef = def as { name: string; args: readonly unknown[] };
    return { kind: "function", name: fnDef.name, args: fnDef.args };
  }
  return null;
}

function mapNativeType(
  nt: readonly [string, readonly string[]] | null | undefined,
): NativeType | null {
  if (!nt) return null;
  return { name: nt[0], args: nt[1] };
}

function readField(dmmfField: DMMF.Field): FieldDef {
  return {
    name: dmmfField.name,
    dbName: dmmfField.dbName ?? null,
    type: mapFieldType(dmmfField),
    isList: dmmfField.isList,
    isRequired: dmmfField.isRequired,
    isUnique: dmmfField.isUnique,
    isId: dmmfField.isId,
    isUpdatedAt: dmmfField.isUpdatedAt ?? false,
    hasDefaultValue: dmmfField.hasDefaultValue,
    default: mapDefault(dmmfField),
    documentation: dmmfField.documentation ?? null,
    annotations: emptyAnnotationSet(dmmfField.documentation ?? null),
    nativeType: mapNativeType(dmmfField.nativeType),
  };
}

function readModel(dmmfModel: DMMF.Model): ModelDef {
  const fields = dmmfModel.fields.map(readField);

  const primaryKey: PrimaryKeyDef | null = dmmfModel.primaryKey
    ? {
        name: dmmfModel.primaryKey.name ?? null,
        fields: dmmfModel.primaryKey.fields,
      }
    : null;

  const uniqueIndexes: UniqueIndexDef[] = dmmfModel.uniqueIndexes.map((u) => ({
    name: u.name ?? null,
    fields: u.fields,
  }));

  // DMMF's `@@index` reflection has historically been spotty across Prisma versions.
  // Left empty for v0.1; revisit when we need to surface index metadata.
  const indexes: IndexDef[] = [];

  return {
    name: dmmfModel.name,
    dbName: dmmfModel.dbName ?? null,
    documentation: dmmfModel.documentation ?? null,
    fields,
    primaryKey,
    uniqueIndexes,
    indexes,
    annotations: emptyAnnotationSet(dmmfModel.documentation ?? null),
  };
}

function readEnumValue(v: DMMF.EnumValue): EnumValueDef {
  // EnumValue.documentation isn't on every DMMF version; pluck defensively
  // so `@deprecated` on enum values works wherever Prisma surfaces it.
  const documentation = (v as { documentation?: string | null }).documentation ?? null;
  return {
    name: v.name,
    dbName: v.dbName ?? null,
    documentation,
    annotations: emptyAnnotationSet(documentation),
  };
}

function readEnum(dmmfEnum: DMMF.DatamodelEnum): EnumDef {
  return {
    name: dmmfEnum.name,
    dbName: dmmfEnum.dbName ?? null,
    documentation: dmmfEnum.documentation ?? null,
    values: dmmfEnum.values.map(readEnumValue),
    annotations: emptyAnnotationSet(dmmfEnum.documentation ?? null),
  };
}

/**
 * Read a Prisma DMMF Document into OmniPrism's intermediate representation.
 *
 * The returned IR has unparsed annotations (all empty) — run the annotation
 * parser (Task 3) over the IR to populate `annotations` from `documentation`.
 */
export function readDmmf(document: DMMF.Document): OmniPrismIR {
  return {
    models: document.datamodel.models.map(readModel),
    enums: document.datamodel.enums.map(readEnum),
  };
}
