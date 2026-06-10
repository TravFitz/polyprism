---
"@polyprism/ts-shared": patch
"@polyprism/ts-domain-class": patch
"@polyprism/php-shared": patch
"@polyprism/php-domain-class": patch
---

Fix two relation-handling bugs in the domain-class emitters.

**Bug A (ts-domain-class only)** — required relation fields no longer silently
write `undefined` into the private slot when the caller didn't `include` them
in their Prisma query. The constructor now guards required-relation
assignment, the slot is initialised to `undefined`, the getter return type
widens to `T | undefined`, and the field is optional in `UserInit`. The
setter signature stays narrow (`set store(v: Store)`) — callers writing the
slot already have the relation, the widening is read-side honesty.

Downstream call sites that currently assume `order.store` is non-null without
having `include`d it will now fail at compile time rather than at runtime
with "Cannot read properties of undefined". Add `include: { store: true }`
to the Prisma query, or handle the `| undefined` case at the access site.

**Bug B (ts-domain-class + php-domain-class)** — `from(row)` now recursively
hydrates included relations through `RelType.from(...)`. Previously, an
included `quote: { ... }` sub-row was assigned as a plain object, so
`order.quote instanceof Quote` returned `false` and any Quote class methods
or getters/setters were unreachable. List relations are mapped element-wise.
Already-hydrated instances pass through untouched (`instanceof` short-circuit).
Nullable relation values preserve `null`.

The fix is idempotent for instance inputs and only triggers when the
relation key is actually present on the row.
