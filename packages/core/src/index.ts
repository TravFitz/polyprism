// Public API: IR types + annotation parser. The DMMF reader is internal —
// it would leak `@prisma/generator-helper` types into the public surface,
// forcing consumers to install generator-helper just to typecheck. Instead,
// `defineGenerator` (added in Task 5) consumes DMMF internally and hands
// emitters parsed IR.

export * from "./annotations/index.js";
export * from "./emitter/index.js";
export * from "./generator/index.js";
export * from "./ir/index.js";
export * from "./naming/index.js";

export const VERSION = "0.0.0";
