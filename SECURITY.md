# Security Policy

## Reporting a vulnerability

If you find a security issue in OmniPrism, **please do not file a public
GitHub issue.**

Instead, email **travis.fitzgerald@zonos.com** with:

- A description of the issue and its impact.
- A minimal reproduction (a `schema.prisma` snippet and the generator
  config that triggers it is ideal).
- Any thoughts on a fix, if you've got them.

You can expect an acknowledgement within 72 hours and a triage decision
within one week. Critical issues get a patch release as soon as one's ready.

## Supported versions

OmniPrism is pre-1.0. Only the **latest minor release line** receives
security fixes. Once 1.0 ships this policy will expand.

## Scope

In scope:

- Code execution, path traversal, prototype pollution, or other classic
  vulnerabilities in the generator itself.
- Annotation-parser edge cases that crash or produce malformed output that
  could be misinterpreted as valid TypeScript.

Out of scope:

- Issues in `prisma` / `@prisma/client` itself — report those upstream.
- The contents of a user's `schema.prisma` (we generate what you give us).
- Dependency vulnerabilities flagged in transitive devDeps (we don't ship
  runtime dependencies on any published `@omniprism/*` package).
