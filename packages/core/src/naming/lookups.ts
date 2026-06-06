// Build name → identifier lookup maps from an IR + naming config.
//
// Every domain-class-style renderer (TS + PHP) needs the same pair of
// "schema name → resolved identifier" maps so the type-mapper, the
// default-formatter, and the cross-reference emission can all agree on
// what each model / enum is called in the output language. Pre-hoist
// this lived as identical 20-line `new Map` literals in three renderers.
//
// The single optional argument is `namespacePrefix`: when set, each
// value is `${namespacePrefix}\\${ident}` (PHP's fully-qualified-name
// shape, e.g. `"Generated\\Models\\User"`); when null (TS), values are
// the bare ident (`"User"`). Languages that need additional formatting
// (file names, slashes vs dots) can layer on top of the returned map.

import type { PolyPrismConfig } from "../generator/config.js";
import type { EnumDef, ModelDef, PolyPrismIR } from "../ir/types.js";
import { resolveTypeIdent } from "./resolver.js";

/**
 * Build a `schemaName → resolvedIdent` map for every enum in the IR.
 *
 * @param ir               Parsed Prisma IR
 * @param config           Generator config (drives `typeNaming` convention)
 * @param namespacePrefix  Optional PHP-style namespace to prepend (e.g.
 *                         `"Generated\\Enums"`). Pass `null` for the bare
 *                         identifier shape TS renderers use.
 */
export function buildEnumIdentLookup(
  ir: Pick<PolyPrismIR, "enums">,
  config: PolyPrismConfig,
  namespacePrefix: string | null = null,
): Map<string, string> {
  return new Map(ir.enums.map((e) => [e.name, resolvedIdent(e, config, namespacePrefix)]));
}

/**
 * Build a `schemaName → resolvedIdent` map for every model in the IR.
 *
 * Same shape as {@link buildEnumIdentLookup} — only the source array
 * differs (`ir.models` vs `ir.enums`). Kept as two functions rather than
 * one generic helper so call sites read clearly (`buildModelIdentLookup`
 * is more grep-friendly than `buildIdentLookup(ir.models, ...)`).
 */
export function buildModelIdentLookup(
  ir: Pick<PolyPrismIR, "models">,
  config: PolyPrismConfig,
  namespacePrefix: string | null = null,
): Map<string, string> {
  return new Map(ir.models.map((m) => [m.name, resolvedIdent(m, config, namespacePrefix)]));
}

function resolvedIdent(
  def: ModelDef | EnumDef,
  config: PolyPrismConfig,
  namespacePrefix: string | null,
): string {
  const ident = resolveTypeIdent({
    schemaName: def.name,
    override: def.annotations.name,
    convention: config.naming.typeNaming,
  });
  return namespacePrefix !== null ? `${namespacePrefix}\\${ident}` : ident;
}
