#!/usr/bin/env node
// Prisma generator entry point for @polyprism/php-domain-class.

import { defineGenerator } from "@polyprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "PolyPrism PHP Domain Class",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
