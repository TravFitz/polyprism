// File output abstraction used by all pattern emitters.
// The actual implementation writes to disk; tests can substitute an
// in-memory writer that captures emitted files for snapshotting.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface FileWriter {
  /** Write `content` to `relativePath` (relative to the writer's output dir). */
  write(relativePath: string, content: string): Promise<void>;
}

export function createFileWriter(outputDir: string): FileWriter {
  return {
    async write(relativePath: string, content: string): Promise<void> {
      const fullPath = resolve(outputDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    },
  };
}

/** In-memory writer for tests. Captures file paths and contents. */
export interface InMemoryFileWriter extends FileWriter {
  readonly files: ReadonlyMap<string, string>;
}

export function createInMemoryFileWriter(): InMemoryFileWriter {
  const files = new Map<string, string>();
  return {
    files,
    async write(relativePath: string, content: string): Promise<void> {
      files.set(relativePath, content);
    },
  };
}
