#!/usr/bin/env node
// Prisma generator entry point for @omniprism/ts-type.

import { defineGenerator } from "@omniprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "OmniPrism TypeScript Type Alias",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
