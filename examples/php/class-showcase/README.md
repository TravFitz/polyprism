# php-class-showcase example

A billing/orders Prisma schema exercising every behaviour of the **php-class**
pattern (PHP 8.1+ `final class User` with public typed properties via
constructor property promotion — mutable, the canonical PHP 8 DTO shape).

- **2 models**: `Customer`, `Order`
- **2 enums**: `CustomerTier`, `OrderStatus`
- **Every PHP scalar mapping** — `String → string`, `Int → int`,
  `Float → float`, `Boolean → bool`, `DateTime → \DateTimeImmutable`,
  `BigInt → int`, `Decimal → string`, `Bytes → string`
- **Every default kind** — literal, enum case, `now()`, unrepresentable
  `cuid()`
- **All four annotation shapes** — `@hide`, `@deprecated`, `@name`,
  `@type`, and both `@json` inline forms (anonymous + named)
- **Relations**: 1-to-many (Customer ↔ Order), self-reference (Order.parentOrder)
- **Pattern**: `polyprism-php-class`

## Run

```bash
pnpm install         # from the repo root
pnpm -F polyprism-example-php-class-showcase generate
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

`scripts/smoke.php` is run by CI under PHP 8.2 to verify the generated
output round-trips correctly: every class instantiates, `final readonly`
enforcement works on JsonType classes, `@hide` actually drops the field
from the constructor signature, and `json_encode` produces the expected
shape. Run it locally with:

```bash
# from a throwaway directory that has vendor/ with the Generated\ autoload wired
php scripts/smoke.php
```

See `.github/workflows/ci.yml` for the exact CI invocation.

## What this example does NOT cover

`@coerce` / `@normalise` / `@noCoerce` are parsed but ignored by `php-class` —
they're domain-class features. See
[`examples/php/domain-class-showcase`](../domain-class-showcase) for the PHP
property-hook pattern that actually fires them.
