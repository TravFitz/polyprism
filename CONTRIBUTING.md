# Contributing to OmniPrism

Thanks for your interest! This guide covers the day-to-day: setting up the
repo, running things locally, and getting a change merged.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js** ≥ 22 (we use the native test runner integrations and ESM-only
  builds — older Node won't keep up)
- **pnpm** 9.x (the repo's `packageManager` field pins the exact version)
- **Git** (obviously)

## Repo layout

```
omniprism/
├── packages/
│   ├── core/              # Language-agnostic IR, DMMF reader, annotation parser
│   ├── ts-shared/         # TS-specific renderers shared across all ts-* patterns
│   ├── ts-interface/      # `export interface User { ... }`
│   ├── ts-type/           # `export type User = { ... };`
│   └── ts-class/          # `export class User { ... }`
├── examples/              # Three example schemas (simple-blog, task-tracker, complex-ecommerce)
├── .changeset/            # Pending release notes
└── .github/workflows/     # CI + release
```

**Architecture rule:** DMMF (Prisma's officially-unstable internal metadata
format) is **never** allowed to leak past `@omniprism/core/src/reader/`.
Pattern packages consume only OmniPrism's IR. This is what lets every
published package have zero third-party runtime dependencies.

## Common commands

All run from the repo root:

```bash
pnpm install              # Install everything
pnpm run ci               # biome check (lint + format) — same thing CI runs
pnpm typecheck            # tsc --noEmit across all packages
pnpm test                 # vitest, all packages
pnpm test:watch           # vitest watch mode, all packages
pnpm build                # tsup build, all packages
pnpm lint:fix             # auto-fix lint findings
pnpm format               # auto-fix formatting
```

`pnpm run ci` is the gate. If it passes locally, CI will pass.

> ⚠️ `pnpm ci` (without the `run`) is a reserved pnpm subcommand. It will
> not run the script. Always `pnpm run ci`.

## Regenerating the examples

```bash
pnpm -F "omniprism-example-*" generate
```

This invokes `prisma generate` against each example schema and writes the
output to `examples/<name>/generated/`. The CI matrix job typechecks the
generated output of `simple-blog` and `task-tracker` under both Prisma 6 and
Prisma 7.

## Writing tests

Tests live in `packages/*/tests/`. We use vitest with inline snapshots — when
adding a new test, write `expect(value).toMatchInlineSnapshot()` and run
`pnpm test -u` once to populate it.

Test fixtures build the IR by hand rather than running `prisma generate`.
This keeps tests fast and Prisma-version-agnostic.

## Writing a changeset

If your change should appear in the changelog or trigger a version bump:

```bash
pnpm changeset
```

Pick which packages are affected and the bump type (patch/minor/major). The
file goes in `.changeset/` and gets committed alongside your PR.

If your change is internal (refactor, test, docs-only, CI), skip the
changeset — there's nothing to ship.

## Adding a new pattern

The pattern packages are deliberately thin (~10 lines each) — almost
everything lives in `@omniprism/ts-shared`. To add a new pattern:

1. Create `packages/ts-<name>/` mirroring an existing pattern's structure
   (`package.json`, `tsconfig.json`, `tsup.config.ts`, `src/index.ts`,
   `src/generator.ts`).
2. The `bin` name in `package.json` must NOT contain `/`, so use
   `omniprism-ts-<name>` (not `@omniprism/ts-<name>`).
3. If the pattern shares the existing field-rendering logic, add it to
   `DeclarationStyle` in `packages/ts-shared/src/render-model.ts` and wire
   the new case there. The wrapper package then becomes:

   ```ts
   import { emitModels } from "@omniprism/ts-shared";
   export const emit = (ctx) => emitModels(ctx, { declarationStyle: "<name>" });
   ```

4. If the pattern needs a fundamentally different output shape (e.g. Zod
   schemas don't fit the same model-per-file mould), add it as a peer
   package that consumes the IR directly and does its own rendering.

## Filing issues

Use the bug-report or feature-request template. The bug template asks for a
minimal `schema.prisma` that reproduces — that's by far the fastest way for
us to help.

## Pull requests

- Branch off `main`.
- Keep PRs focused — one logical change per PR.
- Include a changeset if user-visible.
- Make sure `pnpm run ci`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
  all pass locally before pushing.
- The PR template has a checklist; tick what's done.

We use [Conventional Commits](https://www.conventionalcommits.org)-style PR
titles where it makes sense (`feat:`, `fix:`, `chore:`) but it's not
strictly enforced.

## Release process

Releases are automated via [changesets](https://github.com/changesets/changesets):

1. PRs that should ship include a `.changeset/*.md` file.
2. When a PR with changesets merges to `main`, the release workflow opens
   a "Version Packages" PR that bumps versions and rewrites the changelog.
3. Merging that PR triggers the publish to npm with provenance.

Maintainers don't manually edit version fields or publish — the workflow
handles it.

## Questions?

Open a [Discussion](https://github.com/TravFitz/omniprism/discussions) or
file an issue. We're friendly. Mostly.
