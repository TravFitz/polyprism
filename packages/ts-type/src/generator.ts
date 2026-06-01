#!/usr/bin/env node
// Prisma generator entry point for @polyprism/ts-type.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism TypeScript Type Alias",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
