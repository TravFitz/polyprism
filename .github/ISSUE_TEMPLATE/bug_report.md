---
name: Bug report
about: Something OmniPrism produces, crashes on, or refuses that it probably shouldn't
title: "[bug] "
labels: bug
---

## What happened

<!-- One or two sentences. -->

## What you expected

<!-- What output / behaviour did you think you'd get? -->

## Minimal reproduction

A minimal `schema.prisma` that reproduces, plus the generator config:

```prisma
generator omniprismCodegen {
  provider = "omniprism-ts-interface"  // or whichever
  output   = "../generated"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ... the smallest model / enum / annotation that triggers it
```

If the output is wrong, paste both the actual and expected output too.

## Environment

- OmniPrism version: `vX.Y.Z` (run `pnpm list @omniprism/<pkg>` if unsure)
- Prisma version: `X.Y.Z`
- Node version: `X.Y.Z` (run `node --version`)
- OS: macOS / Linux / Windows

## Additional context

<!-- Stack traces, screenshots, related issues — anything useful. -->
