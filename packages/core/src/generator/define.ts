// Public generator API. Pattern packages (ts-interface, ts-class, ...) call
// `defineGenerator({ manifest, onGenerate })` in their bin entry point.
// We handle the JSON-RPC, DMMF reading, annotation parsing, and config
// resolution; the pattern's onGenerate receives a clean GeneratorContext
// with parsed IR and is never exposed to DMMF directly.

import type { DMMF } from "@prisma/generator-helper";

import { enrichAnnotations } from "../annotations/enrich.js";
import { createFileWriter } from "../emitter/file-writer.js";
import { readDmmf } from "../reader/dmmf-reader.js";
import { parseGeneratorConfig, type RawGeneratorConfig } from "./config.js";
import type { GeneratorContext } from "./context.js";
import { runJsonRpc } from "./json-rpc.js";

export interface GeneratorManifest {
  readonly prettyName: string;
  readonly defaultOutput?: string;
  readonly version?: string;
  readonly requiresGenerators?: readonly string[];
}

export interface GeneratorDefinition {
  readonly manifest: GeneratorManifest;
  readonly onGenerate: (ctx: GeneratorContext) => Promise<void> | void;
}

/** Subset of Prisma's GeneratorOptions we actually consume. */
interface GeneratorOptions {
  readonly dmmf: DMMF.Document;
  readonly generator: {
    readonly output: { readonly value: string | null } | null;
    readonly config: RawGeneratorConfig;
  };
}

/**
 * Wire up a Prisma generator. Runs the JSON-RPC handler; when Prisma sends
 * a `generate` request, the pattern's onGenerate callback fires with a
 * GeneratorContext.
 */
export function defineGenerator(def: GeneratorDefinition): void {
  runJsonRpc({
    getManifest: () => ({ manifest: def.manifest }),
    generate: async (params) => {
      const opts = params as GeneratorOptions;

      const rawIr = readDmmf(opts.dmmf);
      const ir = enrichAnnotations(rawIr);
      const config = parseGeneratorConfig(opts.generator.config);

      const outputDir = opts.generator.output?.value ?? def.manifest.defaultOutput ?? "./generated";
      const writer = createFileWriter(outputDir);

      await def.onGenerate({ ir, config, outputDir, writer });
    },
  });
}
