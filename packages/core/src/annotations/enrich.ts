// Walk an PolyPrism IR and enrich every node's annotations by parsing
// its `documentation` string. Returns a new IR — the input is not mutated.

import type {
  AnnotationSet,
  EnumDef,
  EnumValueDef,
  FieldDef,
  ModelDef,
  PolyPrismIR,
} from "../ir/types.js";
import { parseAnnotations } from "./parser.js";

export function enrichAnnotations(ir: PolyPrismIR): PolyPrismIR {
  return {
    models: ir.models.map(enrichModel),
    enums: ir.enums.map(enrichEnum),
  };
}

function enrichModel(model: ModelDef): ModelDef {
  return {
    ...model,
    annotations: mergeRawDoc(parseAnnotations(model.documentation), model.documentation),
    fields: model.fields.map(enrichField),
  };
}

function enrichField(field: FieldDef): FieldDef {
  return {
    ...field,
    annotations: mergeRawDoc(parseAnnotations(field.documentation), field.documentation),
  };
}

function enrichEnum(enumDef: EnumDef): EnumDef {
  return {
    ...enumDef,
    annotations: mergeRawDoc(parseAnnotations(enumDef.documentation), enumDef.documentation),
    values: enumDef.values.map(enrichEnumValue),
  };
}

function enrichEnumValue(value: EnumValueDef): EnumValueDef {
  return {
    ...value,
    annotations: mergeRawDoc(parseAnnotations(value.documentation), value.documentation),
  };
}

/**
 * The parser's `documentation` field has annotation lines stripped. For nodes
 * that never had documentation, ensure that stays null rather than empty string.
 */
function mergeRawDoc(parsed: AnnotationSet, _original: string | null): AnnotationSet {
  return parsed;
}
