# @polyprism/php-readonly

Prisma 6 & 7 generator that emits **PHP 8.2+ `final readonly class` value objects** from your `schema.prisma`. Immutable DTOs with constructor property promotion. Part of [PolyPrism](https://github.com/TravFitz/polyprism).

```prisma
generator polyprismCodegen {
  provider = "polyprism-php-readonly"
  output   = "../src/Generated"
}
```

That's the whole API. Pair it with a composer.json psr-4 mapping and you're done:

```json
{
  "autoload": {
    "psr-4": { "Generated\\": "src/Generated/" }
  }
}
```

## What it emits

```php
<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\Role;

final readonly class User
{
    public function __construct(
        public string $id,
        public string $email,
        public ?string $name = null,
        public Role $role = Role::MEMBER,
        public \DateTimeImmutable $createdAt = new \DateTimeImmutable(),
    ) {}
}
```

Same shape as [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class), but the class is marked `readonly` — properties can be assigned in the constructor and never again. Try `$user->email = 'x';` after construction and PHP throws `Error: Cannot modify readonly property User::$email`.

## When to use this over `php-class`

- **You want value objects** — DTOs that should never mutate after construction. Read-only enforcement at the language level means accidental writes get caught by the engine, not by code review.
- **You want safe sharing** — readonly is the right shape for data you pass around without defensive copying: queue payloads, FFI handlers, event objects, anything that travels through a pipeline you don't fully own.
- **You're modelling events / value semantics** — orders, payments, audit entries: things that, once recorded, shouldn't change.

Use [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class) when you need to mutate properties in place (e.g. updating a status before saving). The two patterns are otherwise identical — same constructor signature, same property types, same `use` statements.

If you need setter-driven **`@coerce` / `@normalise` behaviour** (stringified `Int` columns from JSON bodies, email normalisation on assignment, etc.), use [`@polyprism/php-domain-class`](https://www.npmjs.com/package/@polyprism/php-domain-class) instead. PHP 8.4 property hooks plus the Composer-published [`polyprism/runtime`](https://packagist.org/packages/polyprism/runtime) runtime — the trade is one Composer dependency in exchange for active boundary normalisation.

## Updating a readonly value

Use the `with...` pattern in your own code:

```php
$user = new User(id: 'abc', email: 'x@y.com');

// Can't do this — PHP throws Error:
// $user->email = 'z@y.com';

// Do this instead:
$updated = new User(
    id: $user->id,
    email: 'z@y.com',
    name: $user->name,
    role: $user->role,
    createdAt: $user->createdAt,
);
```

A future minor release may emit `withX(): static` methods automatically. For v0, the pattern is hand-written at the call site.

## Everything else

Type mapping, annotation support, default handling, constructor ordering, file layout — identical to [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class). See that package's README for the full table.

## Links

- [PolyPrism on GitHub](https://github.com/TravFitz/polyprism) — full feature list, annotation reference, side-by-side pattern examples
- [`@polyprism/php-class`](https://www.npmjs.com/package/@polyprism/php-class) — mutable counterpart
- [`@polyprism/php-domain-class`](https://www.npmjs.com/package/@polyprism/php-domain-class) — property hooks with active `@coerce` / `@normalise` (PHP 8.4+)
- [Issue tracker](https://github.com/TravFitz/polyprism/issues)

## License

[MIT](https://github.com/TravFitz/polyprism/blob/main/LICENSE) © Travis Fitzgerald
