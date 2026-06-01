// Renders a single enum file. All patterns share this output — enums are
// pure data declarations, not affected by pattern choice.

import type { EnumDef, EnumValueDef } from "../ir/types.js";
import { resolveTypeIdent } from "../naming/resolver.js";
import type { NamingConfig } from "../naming/types.js";

export function renderEnum(enumDef: EnumDef, naming: NamingConfig): string {
  const ident = resolveTypeIdent({
    schemaName: enumDef.name,
    override: enumDef.annotations.name,
    convention: naming.typeNaming,
  });

  const visibleValues = enumDef.values.filter((v) => !v.annotations.hide);
  const valueLines = visibleValues.map(renderEnumValue).join("\n");
  const header = renderHeader(enumDef);

  return `${header}export enum ${ident} {\n${valueLines}\n}\n`;
}

function renderEnumValue(value: EnumValueDef): string {
  const dbValue = value.dbName ?? value.name;
  const docBlock = renderValueJsDoc(value);
  return `${docBlock}  ${value.name} = "${dbValue}",`;
}

function renderHeader(enumDef: EnumDef): string {
  const lines: string[] = [];
  if (enumDef.annotations.documentation) {
    for (const docLine of enumDef.annotations.documentation.split("\n")) {
      lines.push(` * ${docLine}`);
    }
  }
  if (enumDef.annotations.deprecated) {
    const reason = enumDef.annotations.deprecated.reason;
    lines.push(reason ? ` * @deprecated ${reason}` : " * @deprecated");
  }
  return lines.length > 0 ? `/**\n${lines.join("\n")}\n */\n` : "";
}

function renderValueJsDoc(value: EnumValueDef): string {
  const lines: string[] = [];
  if (value.annotations.documentation) {
    for (const docLine of value.annotations.documentation.split("\n")) {
      lines.push(`   * ${docLine}`);
    }
  }
  if (value.annotations.deprecated) {
    const reason = value.annotations.deprecated.reason;
    lines.push(reason ? `   * @deprecated ${reason}` : "   * @deprecated");
  }
  return lines.length > 0 ? `  /**\n${lines.join("\n")}\n   */\n` : "";
}
