---
"@polyprism/core": patch
"@polyprism/runtime": patch
"@polyprism/ts-class": patch
"@polyprism/ts-domain-class": patch
"@polyprism/ts-interface": patch
"@polyprism/ts-shared": patch
"@polyprism/ts-type": patch
---

Sanity-audit follow-ups before the shopify-duty-tax dogfood: two real
runtime bugs and a handful of lying-doc / cosmetic fixes surfaced by a
fresh-eyes review pass.

**Runtime fixes (`@polyprism/runtime`)**

- `coerceFloat` no longer silently accepts garbage-tail strings like
  `"5.5abc"` (which `Number.parseFloat` was parsing as `5.5`). Switched
  to `Number()` + an empty-string guard, mirroring the `coerceInt`
  rewrite. Setter contract is now consistent: a Float-typed field
  rejects any string that isn't fully a valid number.
- `coerceBigInt("")` and `coerceBigInt("   ")` no longer return `0n`
  (which `BigInt("")` does natively — spec behaviour, but lethal as a
  silent coercion). An empty-string id from a boundary payload now
  throws instead of becoming a legitimate-looking zero.

**Lying-doc fixes**

- `@polyprism/ts-domain-class` README and `src/index.ts` no longer claim
  `from()`, `toJSON()`, and `builder()` are "post-rc.1 / post-rc.2 / in
  release-candidate flow" — those features have shipped since the first
  publish but the docs hadn't caught up. The npm landing page now
  reflects what's actually available.
- The annotation count across `core`, `ts-interface`, `ts-type`,
  `ts-class`, and root `README.md` was "seven" but the parser supports
  eight (`@noCoerce` was added without updating the enumeration).
  Updated count + added `@noCoerce` to each list.
- Generated `from()` JSDoc no longer points consumers at `@polyprism/ts-zod`
  (which isn't on npm yet — anyone searching gets a 404). Softened to "a
  Zod-based runtime validation pattern is planned for a future release".
- Added a paragraph to the `from()` JSDoc explicitly noting that setters
  can still throw `TypeError` on uncoercible values, even though `from()`
  itself doesn't validate.
- Root `README.md` roadmap table previously said v0.3 would add
  `ts-domain-class`. It's at v0.1 already; rewrote the table.

**Renderer polish**

- Nullable strict pass-through setters no longer emit the cosmetic
  no-op wrap `this.#x = v === null ? null : v;`. Now emits `this.#x = v;`
  directly. Wraps still emit when the setter actually has runtime work
  (coerce or normalise).
- Required + prisma-assigned field getters (`@default(cuid())`,
  `@default(now())`, `@default(autoincrement())`, etc.) now carry an
  `@remarks` JSDoc tag explaining that the declared type is honest
  post-insert but reads on a freshly-constructed instance return
  `undefined`. IDE hovers surface the contract; runtime behaviour
  unchanged (the toJSON defensive design depends on the graceful
  undefined path, so we deliberately don't make the getter throw).
