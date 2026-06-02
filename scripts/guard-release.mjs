#!/usr/bin/env node
// Pre-publish gate. Refuses to invoke `changeset publish` unless the HEAD
// commit is the one that the changesets/action bot creates when a "Version
// Packages" PR merges — i.e. the only commit on this repo that legitimately
// authorises a release.
//
// Why this exists (2026-06-02):
//
// changesets/action's `publish` step runs whenever there are no unmerged
// changesets in `.changeset/`, regardless of whether a Version Packages PR
// has actually merged. Its tagline reads:
//
//     "No changesets found. Attempting to publish any unpublished packages to npm"
//
// That tagline is load-bearing: it inspects each package.json's `version`
// field against npm's registry and publishes anything that's "ahead." Adding
// a NEW package (any package not yet on npm) at any non-`0.0.0` version is
// implicitly "ahead." On 2026-06-02 this autopublished
// `@polyprism/runtime@0.1.0` and `@polyprism/ts-domain-class@0.1.0` as
// stable releases because their initial package.json carried `"version":
// "0.1.0"`. The intent had been to ship them as `0.2.0-rc.0` after a
// proper changeset cycle.
//
// The fix has two layers:
//
//   1. (Procedural.) New packages should start at `"version": "0.0.0"`. A
//      first changeset then bumps them to the first real release version.
//      This is documented in CONTRIBUTING-shaped notes; relying on it
//      alone is brittle (one slip = one accidental publish).
//
//   2. (This script.) Even if a new package slips in at a publishable
//      version, the workflow refuses to publish unless the HEAD commit
//      title is exactly `chore: version packages` — the title the
//      changesets-action bot uses when it merges a Version Packages PR.
//      That commit is the only one that legitimately authorises a
//      `changeset publish` run.
//
// Emergency override: set `ALLOW_RELEASE_BYPASS=1` in the workflow env if
// you need to force a publish without going through Version Packages
// (e.g. recovering from a botched release). Leaves a loud trace in the
// workflow log so the override is auditable.

import { execSync } from "node:child_process";

const EXPECTED_PREFIX = "chore: version packages";

function shellTrim(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function main() {
  const headSubject = shellTrim("git log -1 --pretty=%s");
  const headAuthor = shellTrim("git log -1 --pretty=%an");

  console.log(`[guard-release] HEAD commit: "${headSubject}"`);
  console.log(`[guard-release] HEAD author: ${headAuthor}`);

  if (process.env.ALLOW_RELEASE_BYPASS === "1") {
    console.warn(
      "[guard-release] ⚠ ALLOW_RELEASE_BYPASS=1 — skipping the commit-title check. " +
        "Make sure this was intentional.",
    );
    process.exit(0);
  }

  if (!headSubject.startsWith(EXPECTED_PREFIX)) {
    console.log(
      `[guard-release] HEAD commit title doesn't start with "${EXPECTED_PREFIX}" — ` +
        "this is not a Version Packages merge commit, so we are NOT publishing.",
    );
    console.log(
      "[guard-release] If you intended to release: add a changeset (`pnpm changeset`), " +
        "push, merge the Version Packages PR that the workflow opens, then this gate " +
        "will allow the next workflow run to publish.",
    );
    console.log(
      "[guard-release] If this is an emergency that genuinely needs to bypass the " +
        "gate, set ALLOW_RELEASE_BYPASS=1 in the workflow env (or temporarily edit " +
        "the release workflow).",
    );
    // Exit 0, not 1 — we want the workflow step to succeed silently so the
    // overall workflow stays green. The publish just doesn't run.
    process.exit(0);
  }

  console.log(
    "[guard-release] ✓ HEAD is a Version Packages merge commit. Proceeding with publish.",
  );
  process.exit(0);
}

main();
