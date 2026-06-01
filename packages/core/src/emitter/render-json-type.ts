// Renders a JSON-type file from an inline `@json(...)` annotation.
// All patterns share this output — JSON types are plain TypeScript type
// aliases regardless of which pattern the model itself uses.
//
// The type expression is pretty-formatted so multi-property objects break
// onto multiple lines instead of becoming one-line monstrosities.

import { prettyFormatType } from "./format-type.js";

export function renderJsonType(typeName: string, typeExpression: string): string {
  const formatted = prettyFormatType(typeExpression);
  return `export type ${typeName} = ${formatted};\n`;
}
