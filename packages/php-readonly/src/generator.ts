#!/usr/bin/env node
// Prisma generator entry point for @polyprism/php-readonly.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism PHP Readonly Class",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
