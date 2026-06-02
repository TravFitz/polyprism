#!/usr/bin/env node
// Prisma generator entry point for @polyprism/ts-domain-class.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism TypeScript Domain Class",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
