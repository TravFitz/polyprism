# Releasing PolyPrism

This repo ships two registries:

- **npm** — the `@polyprism/*` packages (everything in `packages/*` except `runtime-php/`). Fully automated via [changesets](https://github.com/changesets/changesets) — you don't do anything manually.
- **Packagist (Composer)** — the `polyprism/runtime` package, which lives at `packages/runtime-php/` in this monorepo but publishes to its own standalone GitHub repo. Semi-automated via a GitHub Action — you click a button, the action does the rest.

This document is the canonical procedure for both.

## npm release flow (automated)

Triggered by merging changesets into `main`.

1. **You write a changeset** in `.changeset/<some-slug>.md` describing the change and which packages bump.
2. **You push that changeset to `main`** (direct commit or PR — the repo allows both during v0.x).
3. **The release workflow notices the pending changeset** and opens a "Version Packages" PR. The PR is auto-titled `chore: version packages` and contains the bumped `package.json` versions, regenerated `CHANGELOG.md` files, and a deletion of the consumed changeset markdown.
4. **You merge the Version Packages PR.**
5. **The release workflow runs again,** sees no pending changesets, and runs `pnpm release` → `changeset publish` → `npm publish` for each package that's not `private: true`. It also creates per-package git tags (`@polyprism/runtime@0.2.1`, etc.) and a GitHub Release.

You never touch npm credentials. `NPM_TOKEN` is stored as a repo secret; the workflow reads it.

## Composer release flow (semi-automated)

`polyprism/runtime` is a Composer package, not an npm one. Packagist (Composer's registry) reads versions from git tags on a repo whose **root** has a `composer.json`. Our monorepo's root is a pnpm workspace, so Packagist can't be pointed at it directly. The Composer package needs to live in a **separate, standalone GitHub repo** that contains only the runtime-php contents at its root.

The split-and-tag dance is automated by the [`release-composer.yml`](.github/workflows/release-composer.yml) workflow. **You trigger it manually** (workflow_dispatch) when you want to ship a Composer release.

### One-time setup (do this before the first Composer release)

These steps are clicky-UI work — they can't be scripted from the repo.

**1. Create the standalone GitHub repo.**

Go to https://github.com/new and create:

- **Repository name:** `polyprism-runtime-php`
- **Owner:** `TravFitz`
- **Visibility:** Public
- **Don't** initialise with a README, license, or `.gitignore` — leave it empty. The first split will populate it.

**2. Generate a Personal Access Token (PAT) for the push.**

GitHub Actions can't push to a different repo using the default `GITHUB_TOKEN` — it's scoped to the current repo only. You need a PAT.

- Go to https://github.com/settings/personal-access-tokens/new
- **Token name:** `polyprism-runtime-php push`
- **Resource owner:** TravFitz
- **Expiration:** As long as you're comfortable with (90 days, 1 year, or no expiration if you'll otherwise forget)
- **Repository access:** *Only select repositories* → `polyprism-runtime-php`
- **Repository permissions:**
  - Contents: **Read and write** (needed to push commits + tags)
  - Metadata: **Read-only** (auto-included)
- **Click "Generate token"** and copy the token string immediately — you won't see it again.

**3. Add the token as a repo secret in `polyprism`.**

- Go to https://github.com/TravFitz/polyprism/settings/secrets/actions
- Click **New repository secret**
- **Name:** `RUNTIME_PHP_PUSH_TOKEN` (exact spelling — this is what the workflow reads)
- **Secret:** paste the PAT from step 2
- Click **Add secret**

That's the one-time prep. Now you can run the workflow.

### Cutting a Composer release

When `packages/runtime-php/` has changes you want to ship as a new Packagist version, two paths land in the same workflow — pick whichever fits the moment.

#### Path A: tag-triggered (the routine release path)

**One shell command end-to-end.** Push a tag named `runtime-php-v<VERSION>` to `main` and the workflow auto-fires:

```bash
# After your changes are merged to main
git checkout main && git pull
git tag runtime-php-v0.2.1
git push origin runtime-php-v0.2.1
# Done — Packagist will have it in ~90s.
```

The workflow:

1. Strips `runtime-php-v` off the tag name to get the SemVer
2. Validates the version is SemVer-shaped (rejects malformed tags so nothing reaches Packagist)
3. Runs PHPUnit against `packages/runtime-php/` under PHP 8.4
4. Subtree-splits the directory + tags the standalone repo `v0.2.1`
5. Packagist's webhook fires within ~60s and the new version goes live

The `runtime-php-v` prefix is what distinguishes this trigger from any other tag pattern (npm changesets creates per-package tags like `@polyprism/runtime@0.2.1` which look superficially similar but DON'T match — those are npm's tags, not yours). Only `runtime-php-v*` tags trigger a Composer publish.

#### Path B: workflow_dispatch (the override path)

Click "Run workflow" in the GitHub Actions UI. Useful when:

- You want the **dry-run flag** (test the workflow without actually publishing — only available on this path)
- You're recovering from a botched tag (e.g. you pushed `runtime-php-v0.2.1` to a broken commit and need to retry without retagging)
- You're somewhere without a terminal

How:

- Go to https://github.com/TravFitz/polyprism/actions/workflows/release-composer.yml
- Click **Run workflow**
- **Branch:** `main`
- **Version:** SemVer string without the `v` prefix. Examples:
  - `0.2.0` — first Composer release
  - `0.2.1` — patch bump
  - `0.3.0-rc.1` — release candidate (valid SemVer, Packagist handles it)
- **Dry-run:** leave off for a real release; toggle on to test the workflow without actually publishing
- Click **Run workflow**

Same downstream steps as Path A — runs PHPUnit, subtree-splits, tags the standalone repo, Packagist webhook fires. Total runtime ~1–2 minutes either way.

**3. Submit the package to Packagist (first release only).**

After the first successful workflow run:

- Sign in at https://packagist.org/login/ (GitHub OAuth)
- Click **Submit** at the top
- Paste: `https://github.com/TravFitz/polyprism-runtime-php`
- Packagist fetches the repo, reads `composer.json`, registers as `polyprism/runtime`, and creates the first version from the `v0.2.0` tag

Packagist will prompt you to enable a GitHub webhook for auto-updates. **Say yes.** Future releases will then auto-publish on tag push without you touching Packagist.

**4. Subsequent releases.**

Just step 2 — push a `runtime-php-v<VERSION>` tag (Path A) or trigger the workflow from the UI (Path B). The Packagist webhook handles the rest — you should see the new version on https://packagist.org/packages/polyprism/runtime within ~60 seconds of the workflow finishing.

If Packagist doesn't update within a few minutes, two recovery paths:

- On the Packagist package page, click **Update** to force a re-fetch
- On the standalone repo's Settings → Webhooks page, find the Packagist webhook and click **Redeliver** on the most recent ping

### When to cut a Composer release

The npm packages and the Composer package are versioned **independently**. They share a name (`polyprism/runtime`) but live in different registries with different version trajectories:

- **npm `@polyprism/runtime`** ships every time the @polyprism/* fixed-version group bumps. Could be functional or could just be a "everyone moves together" patch.
- **Packagist `polyprism/runtime`** only ships when the PHP code in `packages/runtime-php/` actually changes — when there's real user-facing reason to cut a new version.

Rules of thumb for the Composer side:

- **Patch bump (0.2.x → 0.2.x+1):** bug fix in `Coerce` or `Normalise` that doesn't change the API
- **Minor bump (0.2.x → 0.3.0):** new method on `Coerce` or `Normalise`, new op in the Normalise constant set, anything additive
- **Major bump (0.x → 1.0):** breaking change in the runtime API. Coordinate with a `php-domain-class` major bump on npm at the same time so generated code matches.

The Composer package's `composer.json` doesn't have a `"version"` field by design — Packagist reads the version from git tags on the standalone repo. The workflow handles the tagging.
