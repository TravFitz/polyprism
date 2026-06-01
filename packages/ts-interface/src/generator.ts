#!/usr/bin/env node
// Prisma generator entry point for @omniprism/ts-interface.

import { defineGenerator } from "@omniprism/core";

import { emit } from "./index.js";

defineGenerator({
  manifest: {
    prettyName: "OmniPrism TypeScript Interface",
    defaultOutput: "./generated",
  },
  onGenerate: emit,
});
