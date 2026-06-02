---
"@polyprism/core": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Cross-link the existing pattern READMEs to the newly-published
`@polyprism/ts-domain-class` and remove the now-stale "planned for v0.3 /
on the roadmap" language. The annotation tables for `@normalise` and
`@coerce` in `ts-interface` (and equivalents) now correctly state that
runtime behaviour fires inside `ts-domain-class`, with `@noCoerce`
documented alongside. Sibling-pattern lists across all four core READMEs
gain a `ts-domain-class` entry. Scrub one consumer-specific reference
("Shopify API") from the `ts-domain-class` README example so the npm
landing page reads as a generic example.

No code changes — docs-only patch bump.
