#!/usr/bin/env node
// Prisma generator entry point for @omniprism/ts-class.

import { defineGenerator } from "@omniprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "OmniPrism TypeScript Class",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
