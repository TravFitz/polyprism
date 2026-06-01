import type { FileWriter } from "../emitter/file-writer.js";
import type { PolyPrismIR } from "../ir/types.js";
import type { PolyPrismConfig } from "./config.js";

/**
 * Passed to every pattern emitter's onGenerate callback. Contains the
 * already-parsed IR (annotations enriched), resolved config, output dir,
 * and a file writer.
 */
export interface GeneratorContext {
  readonly ir: PolyPrismIR;
  readonly config: PolyPrismConfig;
  readonly outputDir: string;
  readonly writer: FileWriter;
}
