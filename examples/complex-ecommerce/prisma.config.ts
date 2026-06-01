// Prisma 7 moved the datasource `url` out of `schema.prisma` and into this
// config file. Prisma 6 still wants `url` directly on the `datasource` block
// in the schema — CI's Prisma 6 matrix cell mutates the schema at run time
// to add it back. Prisma 6 does load + evaluate this file (it logs "Loaded
// Prisma config from prisma.config.ts") but ignores `datasource.url` here
// for datasource resolution — the schema's inline url always wins.
//
// Docs: https://pris.ly/d/prisma7-client-config

import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    // `?? ""` keeps the type honest (Prisma's `url` is `string`, not
    // `string | undefined`). `prisma generate` doesn't actually connect,
    // so an empty string at codegen time is harmless.
    url: process.env.DATABASE_URL ?? "",
  },
});
