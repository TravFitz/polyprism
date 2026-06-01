import type { FileWriter } from "../emitter/file-writer.js";
import type { OmniPrismIR } from "../ir/types.js";
import type { OmniPrismConfig } from "./config.js";

/**
 * Passed to every pattern emitter's onGenerate callback. Contains the
 * already-parsed IR (annotations enriched), resolved config, output dir,
 * and a file writer.
 */
export interface GeneratorContext {
  readonly ir: OmniPrismIR;
  readonly config: OmniPrismConfig;
  readonly outputDir: string;
  readonly writer: FileWriter;
}
