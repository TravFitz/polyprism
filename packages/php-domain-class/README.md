# @polyprism/php-domain-class

> Part of [PolyPrism](https://github.com/TravFitz/polyprism) — the multi-pattern Prisma type generator.

Generates **PHP 8.4 domain classes with property hooks** from your Prisma schema. The setter pipeline honours `@coerce`, `@normalise`, and `@noCoerce` so untrusted boundary input (HTTP bodies, form posts, queue messages) is normalised on the way into your model layer — exactly like the TypeScript [`@polyprism/ts-domain-class`](https://github.com/TravFitz/polyprism/tree/main/packages/ts-domain-class) generator, but on the PHP side.

## Requirements

- **PHP 8.4** or later (property hooks are the load-bearing feature)
- A Composer dependency on [`polyprism/runtime`](https://github.com/TravFitz/polyprism/tree/main/packages/runtime-php) for the `Coerce` / `Normalise` helpers the generated setters call into

## Install

In your Prisma project:

```bash
npm i -D @polyprism/php-domain-class
# or: pnpm add -D @polyprism/php-domain-class
```

Then, in the PHP project that consumes the generated output:

```bash
composer require polyprism/runtime
```

Wire the generator into `schema.prisma`:

```prisma
generator polyprismCodegen {
  provider = "polyprism-php-domain-class"
  output   = "../generated"
}
```

Wire the generated dir into your `composer.json` autoload:

```json
{
  "require": {
    "polyprism/runtime": "^0.2"
  },
  "autoload": {
    "psr-4": {
      "Generated\\": "src/Generated/"
    }
  }
}
```

## What you get

For each model, a `final class` with one **typed property per field**. Coerce-by-default scalars (Int / Float / BigInt / Decimal / DateTime) get a `set` hook that routes the assigned value through `Polyprism\Runtime\Coerce`, so passing a stringified `"42"` to an `int` field works just like passing the int directly.

```prisma
model User {
  id     String   @id @default(cuid())
  /// @normalise(trim, lowercase)
  email  String
  points Int      @default(0)
  /// @noCoerce
  joined DateTime @default(now())
}
```

```php
<?php

declare(strict_types=1);

namespace Generated\Models;

use Polyprism\Runtime\Coerce;
use Polyprism\Runtime\Normalise;

final class User
{
    public string $id;

    public string $email {
        set(string $value) {
            $this->email = Normalise::apply($value, [Normalise::TRIM, Normalise::LOWERCASE]);
        }
    }

    public int $points = 0 {
        set(int|string $value) {
            $this->points = Coerce::int($value, 'User.points');
        }
    }

    public \DateTimeImmutable $joined;

    public function __construct(
        string $id,
        string $email,
        \DateTimeImmutable $joined,
        int|string $points = 0,
    ) {
        $this->id = $id;
        $this->email = $email;
        $this->joined = $joined;
        $this->points = $points;
    }
}
```

Constructing the class normalises and coerces in one go:

```php
$user = new User(
    id: 'user_1',
    email: '  ADA@EXAMPLE.COM  ',  // → 'ada@example.com'
    joined: new DateTimeImmutable('2026-01-01'),
    points: '42',                  // → 42 (int)
);
```

Bad input throws `TypeError` with a field-path-tagged message:

```php
$user->points = 'abc';
// TypeError: Cannot coerce "abc" to int for User.points
```

### Hydrating from a request body / Prisma row

Every generated class gets a static `from(array $data): self` factory that
routes a Record-like array through the constructor — so the property hooks
fire on every field the same way they would on a direct `new User(...)`
call. Missing required fields throw `\TypeError` with the field name;
optional/defaulted fields fall through to their constructor default;
unknown keys are silently dropped.

```php
// e.g. inside a Laravel controller
public function store(Request $request): User
{
    return User::from($request->json()->all());
    // - email lower-cased + trimmed via @normalise
    // - points stringified "42" coerced to int via @coerce
    // - any extra keys in the request body silently ignored
    // - missing 'email' throws TypeError with the field name
}
```

### Excluding Prisma-managed fields with `@hide`

Fields like `@id @default(autoincrement())`, `@updatedAt`, or
`@default(cuid())` are *Prisma-managed* — the database fills them at insert
time and the developer typically doesn't supply them when constructing a
new record. By default, PolyPrism PHP treats these as **required** fields
on both the constructor and `from()`, because PHP has no equivalent of
TypeScript's "this field is set later by the framework" concept built into
the type system.

If your DTO is purely for *creating* records (POST handlers, queue
producers, etc.), annotate the Prisma-managed fields with `@hide` to drop
them from the generated class entirely:

```prisma
model User {
  /// @hide
  id        String   @id @default(cuid())

  email     String

  /// @hide
  createdAt DateTime @default(now())

  /// @hide
  updatedAt DateTime @updatedAt
}
```

```php
// Now User::from() doesn't require id / createdAt / updatedAt
$user = User::from(['email' => 'ada@example.com']);
```

If your DTO needs to read those fields *after* Prisma has filled them
(typical for the "fetch row from DB → hydrate DTO → serve to client"
flow), keep them on the class and pass them through. PHP `from()` handles
both shapes:

```php
// Hydrating a fetched row — all fields including id/updatedAt present
$user = User::from($prismaRowAsArray);

// Hydrating a request body — annotate @hide on managed fields
$user = User::from($request->json()->all());
```

It's a deliberate v0 trade: explicit-via-annotation rather than implicit-
via-introspection. Matches PHP's "explicit > magic" culture; the
developer always knows what fields the DTO accepts.

### `from()` is not a validator

`from()` is a **constructor adapter, not a validator** — it doesn't check
cross-field invariants or reject explicit `null` for non-nullable fields
beyond what PHP's typed-property contract enforces. Pre-validate untrusted
boundary input with a schema library (JSON Schema, Symfony Validator,
etc.) if those richer failure modes matter to your application.

## Annotations honoured

| Annotation                | What it does                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@hide`                   | Field omitted from the class body                                                                       |
| `@deprecated`             | PHPDoc `@deprecated` tag                                                                                |
| `@name(<ident>)`          | Override the PHP class / field identifier                                                               |
| `@type(<expr>)`           | Override the PHP type expression verbatim                                                               |
| `@json(...)`              | Inline `@json` shapes generate readonly value classes under `JsonTypes/`                                |
| `@coerce(<target>)`       | Cross-type coerce (`@coerce(int)` on a `String` field accepts `int\|string`)                            |
| `@noCoerce`               | Opt a default-coerce scalar back to strict (no widening on the setter)                                  |
| `@normalise(<ops...>)`    | Apply string ops in order on the way in (`trim`, `lowercase`, `uppercase`, `nullEmptyToNull`)           |

## Coerce-by-default scalars

Five Prisma scalars get a coerce hook automatically:

| Prisma type | PHP property type     | Setter accepts                                      | Runtime method            |
| ----------- | --------------------- | --------------------------------------------------- | ------------------------- |
| `Int`       | `int`                 | `int\|string`                                       | `Coerce::int(...)`        |
| `Float`     | `float`               | `float\|int\|string`                                | `Coerce::float(...)`      |
| `BigInt`    | `int`                 | `int\|string`                                       | `Coerce::bigint(...)`     |
| `Decimal`   | `string`              | `string\|float\|int`                                | `Coerce::decimal(...)`    |
| `DateTime`  | `\DateTimeImmutable`  | `\DateTimeImmutable\|string\|int`                   | `Coerce::date(...)`       |

`String` and `Boolean` are strict by default. Use `@coerce(int)` on a `String` field to opt in to cross-type coercion for legacy stringified columns; use `@noCoerce` on a default-coerce field to opt back to strict.

## Compared to `@polyprism/php-class` / `@polyprism/php-readonly`

| Feature                              | `php-class` | `php-readonly` | `php-domain-class`  |
| ------------------------------------ | :---------: | :------------: | :-----------------: |
| PHP floor                            | 8.1         | 8.2            | **8.4**             |
| Mutable after construction           | ✓           |                | ✓                   |
| Constructor property promotion       | ✓           | ✓              |                     |
| `@coerce` / `@normalise` honoured    |             |                | ✓                   |
| Runtime dependency                   | None        | None           | `polyprism/runtime` |

## License

MIT
