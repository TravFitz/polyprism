# php-domain-class-showcase example

A billing/orders Prisma schema exercising every behaviour of the
**php-domain-class** pattern (PHP 8.4+ `final class User` with property
hooks that route `@coerce` / `@normalise` through the Composer-published
[`polyprism/runtime`](https://packagist.org/packages/polyprism/runtime)
package).

- **2 models**: `Customer`, `Order`
- **2 enums**: `CustomerTier`, `OrderStatus`
- **Every default-coerce scalar via property hooks** — `Int`, `Float`,
  `BigInt`, `Decimal`, `DateTime` get widened setter inputs that flow
  through `Polyprism\Runtime\Coerce::*`
- **Every `@normalise` op** — `trim`, `lowercase`, `uppercase`,
  `nullEmptyToNull`
- **`@noCoerce`** opts a default-coerce field out (`internalSeq` stays
  strict-typed Int)
- **Cross-type `@coerce(target)`** (`legacyExternalId` is a `String?`
  field that stores `?int` after the coerce pipeline — the storage type
  shifts to the coerce target's canonical PHP type)
- **Inline `@json`** generates `final readonly` value classes under
  `JsonTypes/`
- **Relations**: 1-to-many (Customer ↔ Order), self-reference
- **Pattern**: `polyprism-php-domain-class`

## Run

```bash
pnpm install         # from the repo root
pnpm -F polyprism-example-php-domain-class-showcase generate
```

Generated files appear in `generated/` and are committed to git:

```
generated/
├── Enums/
│   ├── CustomerTier.php
│   └── OrderStatus.php
├── JsonTypes/
│   ├── OrderRawPayload.php
│   └── ShippingDetails.php
└── Models/
    ├── Customer.php
    └── Order.php
```

## Smoke test

`scripts/smoke.php` is run by CI under **PHP 8.4** (the floor for this
pattern — property hooks are 8.4+) and verifies the full setter pipeline
end-to-end:

- Property hooks fire on construction AND on post-construction assignment
- `@coerce` routes stringified inputs through `Coerce::int` / `Coerce::float` / etc.
- `@normalise` lower-cases / trims / nullifies whitespace-only strings
- `@hide` drops the field from the constructor signature entirely
- `@noCoerce` keeps the setter strict-typed (rejects mismatched input at PHP's TypeError boundary)
- `Coerce::*` throws `TypeError` with the field path on bad input
- `json_encode` round-trips the public hooked properties cleanly

To run the smoke script locally, you need PHP 8.4 + Composer + a Composer
project with both the `Generated\` autoload mapping AND a `path` repository
pointing at `packages/runtime-php/`. The CI workflow at
`.github/workflows/ci.yml` shows the exact dance.

## Composer dependency

Generated code calls into `Polyprism\Runtime\Coerce::*` and
`Polyprism\Runtime\Normalise::*`. The consumer needs:

```bash
composer require polyprism/runtime
```

That's the one runtime dependency for this pattern. The `php-class` and
`php-readonly` patterns are zero-dep.

## What this example does NOT cover

- PHP 8.1–8.3 — property hooks are 8.4+ only. For those targets, use
  [`examples/php/class-showcase`](../class-showcase) (mutable, 8.1+) or
  one of the other PHP patterns.
- Async / coroutines — domain-class is a synchronous DTO pattern. PHP
  Fibers aren't relevant here.
