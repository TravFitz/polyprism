// Root vitest config — applies to every package's `vitest run` because
// vitest walks up from the package's cwd looking for a config file.
//
// The `polyprism-source` condition (configured below under
// `ssr.resolve.conditions`) tells vitest's resolver to use the
// `polyprism-source` field in our `exports` maps when resolving workspace
// packages. The result: `@polyprism/core` resolves to
// `packages/core/src/index.ts` during tests instead of the built
// `dist/index.js` — so a fresh clone with no prior `pnpm build` still has a
// working `pnpm test` and `pnpm typecheck`.
//
// The condition name is deliberately project-namespaced. We do NOT use
// "development" — that one is in Vite's `defaultClientConditions`, so any
// downstream consumer running `vite dev` would otherwise try to resolve our
// `./src/index.ts` (which isn't in the published tarball, only `dist/` is)
// and produce a hard module-not-found error.

import { defineConfig } from "vitest/config";

// Two gotchas baked into the option layout:
//
//  1. Vitest tests run in Node, which is Vite's SSR environment — so the
//     custom condition has to go on `ssr.resolve.conditions`, not the
//     top-level `resolve.conditions` (that one only affects the browser
//     environment in Vite 7).
//
//  2. Vite's `*.conditions` arrays REPLACE the defaults rather than
//     appending. If we only listed "polyprism-source", Vite would have
//     nothing to fall through to when resolving everything else (vitest
//     internals, third-party packages, etc.) — they'd all fail with the
//     same "Failed to resolve entry" error our own packages did before this
//     fix. So we include the standard chain explicitly.

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["polyprism-source", "import", "module", "node", "default"],
    },
  },
});
