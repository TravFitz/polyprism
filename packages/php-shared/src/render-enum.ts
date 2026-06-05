// Renders one Prisma enum as a PHP 8.1+ backed enum (string-typed).
//
// Output shape:
//
//   <?php
//
//   declare(strict_types=1);
//
//   namespace Generated\Enums;
//
//   /**
//    * Doc lines from `///` comments above the schema enum, if any.
//    * @deprecated If the enum has @deprecated
//    */
//   enum Role: string
//   {
//       case ADMIN = 'ADMIN';
//       case MEMBER = 'MEMBER';
//   }
//
// Backed enums (`enum X: string`) were chosen over pure enums because:
//   - Prisma stores enums in the database as strings; round-tripping through
//     `Role::from($dbValue)` and `$enum->value` is the natural mapping.
//   - PHPStan / Psalm / PhpStorm all narrow `enum X: string` cases on
//     equality with string literals, so callers can do
//     `if ($role->value === 'ADMIN')` without losing autocompletion.

import type { EnumDef, EnumValueDef, NamingConfig } from "@polyprism/core";
import { resolveTypeIdent } from "@polyprism/core";

import { renderPhpDoc } from "./phpdoc.js";

export interface RenderEnumOptions {
  readonly enumDef: EnumDef;
  readonly naming: NamingConfig;
  readonly namespace: string;
}

export function renderPhpEnum(opts: RenderEnumOptions): string {
  const { enumDef, naming, namespace } = opts;
  const ident = resolveTypeIdent({
    schemaName: enumDef.name,
    override: enumDef.annotations.name,
    convention: naming.typeNaming,
  });

  const visibleValues = enumDef.values.filter((v) => !v.annotations.hide);
  const caseLines = visibleValues.map(renderEnumCase).join("\n");
  const headerDoc = renderPhpDoc(enumDef.annotations, { indent: 0 });

  return [
    "<?php",
    "",
    "declare(strict_types=1);",
    "",
    `namespace ${namespace};`,
    "",
    `${headerDoc}enum ${ident}: string\n{\n${caseLines}\n}`,
    "",
  ].join("\n");
}

function renderEnumCase(value: EnumValueDef): string {
  // Prisma allows `@map("DB_VALUE")` on enum values via `dbName`. Honour
  // that as the case's backing-string value so consumers can match against
  // what the database actually stores.
  const dbValue = value.dbName ?? value.name;
  // Single-quoted PHP strings don't process escapes for anything except
  // `\\` and `\'`. JSON.stringify gives us double-quoted; flip the quotes
  // and escape any apostrophes in the (very rare) case the value contains
  // one. Realistic Prisma enum values are uppercase ASCII identifiers, so
  // the escape branch is defensive.
  const escapedValue = dbValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const docBlock = renderPhpDoc(value.annotations, { indent: 4 });
  return `${docBlock}    case ${value.name} = '${escapedValue}';`;
}
