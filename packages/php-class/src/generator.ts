#!/usr/bin/env node
// Prisma generator entry point for @polyprism/php-class.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism PHP Class",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
