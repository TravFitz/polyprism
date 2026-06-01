#!/usr/bin/env node
// Prisma generator entry point for @polyprism/ts-interface.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism TypeScript Interface",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
