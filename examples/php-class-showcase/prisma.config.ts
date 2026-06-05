// Prisma 7 moved the datasource `url` out of `schema.prisma` and into this
// config file. Prisma 6 still wants `url` directly on the `datasource` block
// in the schema — CI's Prisma 6 matrix cell mutates the schema at run time
// to add it back.

import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
